/**
 * Multi-Tenant Router (Phase 6 — proper tables + multi-step AI)
 *
 * Flow:
 *   1. detectIntent (greeting / ignore / switch / select / data query)
 *   2. getUserDatabases (multi-DB support)
 *   3. processQuery → checks if tenant has proper_tables_created:
 *        - YES: processQueryProperTables (Phase 6, NEW)
 *        - NO:  processQueryLegacy (JSONB fallback)
 *   4. processQueryProperTables uses:
 *        - Single-call AI: PLAN + SQL together (with rich schema context)
 *        - Validator: ensure SELECT-only, single statement
 *        - Retry up to 3x: AI sees its own error → fixes
 *        - Fuzzy fallback: when 0 rows on entity filter, pg_trgm suggests matches
 *        - Smart formatter: role-aware output (no ₹ on counts/qty)
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const fmt = require('./smart-format');
const tenantPdf = require('./tenant-pdf');
const tenantCsv = require('./tenant-csv');
const tenantChart = require('./tenant-chart');
const tenantLedger = require('./tenant-ledger');
const tenantLedgerPdf = require('./tenant-ledger-pdf');
const selfHeal = require('./self-heal');  // Phase 10: classifyError, resolveColumnError, relaxSQL, validateResult, withRetry, pingDb

// Phase 7.1 + 7.2: auto-attachment thresholds for tenant query results
//   > CSV_ROW_THRESHOLD       → CSV (raw, all cols, Excel-friendly)
//   > PDF_ROW_THRESHOLD .. CSV_ROW_THRESHOLD → PDF (styled, top cols)
//   > 15 .. PDF_ROW_THRESHOLD → AI summary (top 20 with context)
const PDF_ROW_THRESHOLD = 50;
const CSV_ROW_THRESHOLD = 100;

// ════════════════════════════════════════════════════════════════════════
// CACHE & SESSIONS
// ════════════════════════════════════════════════════════════════════════
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

// ── DB SELECTION (PERSISTENT, STICKY) ──────────────────────────────────
// User's explicit DB choice survives PM2 restarts and never silently expires.
// Cleared only when the user runs `switch db` again or selects a different one.
const SELECTIONS_FILE = path.join(__dirname, '..', '.db_selections.json');
let dbSelections = {}; // { phone: tenantId }
try {
  if (fs.existsSync(SELECTIONS_FILE)) {
    dbSelections = JSON.parse(fs.readFileSync(SELECTIONS_FILE, 'utf8')) || {};
  }
} catch (e) {
  console.error('[DB SELECTIONS LOAD ERROR]', e.message);
  dbSelections = {};
}
function saveSelections() {
  try { fs.writeFileSync(SELECTIONS_FILE, JSON.stringify(dbSelections), 'utf8'); }
  catch (e) { console.error('[DB SELECTIONS SAVE ERROR]', e.message); }
}

// ── PENDING DB-SELECT FLOW (in-memory, short TTL) ──────────────────────
// Holds the numbered list "1️⃣ MIS-2 / 2️⃣ MIS Main" between asking and the user replying with a number.
const pendingSelections = new Map();
const PENDING_TTL = 5 * 60 * 1000;

// ── PHASE 7.5: PENDING LEDGER SELECT (in-memory, short TTL) ────────────
// When a ledger query produces multiple name matches, we keep the options +
// resolved tenant + chosen ledger table around so the user can reply "2".
// Takes priority over DB-select if both are pending (latest user action wins).
const pendingLedgers = new Map();
const PENDING_LEDGER_TTL = 5 * 60 * 1000;

// ── Pending calendar context (multi-turn booking flow) ─────────────────
// When the calendar handler asks "what date?" / "what time?", we remember
// the original query + what's missing so the user's next plain reply
// (e.g. "27 May") gets routed back to the calendar handler instead of
// falling through to the data-query path.
//   Key:   phone
//   Value: { tenant, originalQuery, expecting: 'date'|'time'|'any', expiresAt }
const pendingCalendar = new Map();
const PENDING_CALENDAR_TTL = 5 * 60 * 1000;

const MIS_MAIN_ID = 'mis-main-chatbot';

// ════════════════════════════════════════════════════════════════════════
// USER → DATABASES MAPPING
// ════════════════════════════════════════════════════════════════════════
function isMISUser(phone) {
  try {
    const ac = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'access_control.json'), 'utf8'));
    return ac.allowed_numbers?.includes(phone) || ac.users?.[phone];
  } catch (e) { return false; }
}

async function getUserDatabases(supabase, phone) {
  const cached = tenantCache.get(`dbs_${phone}`);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.dbs;

  const dbs = [];
  const isMis = isMISUser(phone);

  const { data: userDbs } = await supabase
    .from('user_databases').select('tenant_id, alias, is_default').eq('phone', phone);

  if (userDbs && userDbs.length > 0) {
    const tenantIds = userDbs.map(d => d.tenant_id);
    const { data: tenants } = await supabase.from('tenants').select('*').in('id', tenantIds);
    for (const d of userDbs) {
      const tenant = tenants?.find(t => t.id === d.tenant_id);
      if (tenant) dbs.push({ ...tenant, alias: d.alias || tenant.name, is_default: !!d.is_default });
    }
  } else {
    const { data: mapping } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).maybeSingle();
    let tenantId = mapping?.tenant_id;
    if (!tenantId) {
      const { data: owner } = await supabase.from('tenants').select('id').eq('phone', phone).maybeSingle();
      tenantId = owner?.id;
    }
    if (tenantId) {
      const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      if (tenant) dbs.push({ ...tenant, alias: tenant.name, is_default: true });
    }
  }

  // Add MIS Main only after tenant DBs — and make it default only if no tenant DBs exist
  if (isMis) {
    const misIsDefault = dbs.length === 0;
    dbs.push({ id: MIS_MAIN_ID, name: 'MIS Main', alias: 'MIS Main', is_default: misIsDefault, virtual: true });
  }

  // Ensure exactly one default (prefer non-MIS-Main, then first)
  const hasDefault = dbs.some(d => d.is_default);
  if (!hasDefault && dbs.length > 0) {
    const tenantDb = dbs.find(d => d.id !== MIS_MAIN_ID);
    (tenantDb || dbs[0]).is_default = true;
  }

  if (dbs.length) {
    tenantCache.set(`dbs_${phone}`, { dbs, ts: Date.now() });
    if (tenantCache.size > 500) { tenantCache.delete(tenantCache.keys().next().value); }
  }
  return dbs;
}

function getSelectedDB(phone) {
  return dbSelections[phone] || null;
}
function setSelectedDB(phone, tenantId) {
  dbSelections[phone] = tenantId;
  saveSelections();
}
function clearSelectedDB(phone) {
  if (phone in dbSelections) {
    delete dbSelections[phone];
    saveSelections();
  }
}

// Pending list helpers (numbered DB-select flow)
function setPending(phone, dbs) {
  pendingSelections.set(phone, { dbs, expiresAt: Date.now() + PENDING_TTL });
}
function getPending(phone) {
  const p = pendingSelections.get(phone);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { pendingSelections.delete(phone); return null; }
  return p.dbs;
}
function clearPending(phone) {
  pendingSelections.delete(phone);
}

// Pending-ledger helpers (numbered name disambiguation flow)
function setPendingLedger(phone, options, tenantId, ledgerTableIdx) {
  pendingLedgers.set(phone, { options, tenantId, ledgerTableIdx, expiresAt: Date.now() + PENDING_LEDGER_TTL });
}
function getPendingLedger(phone) {
  const p = pendingLedgers.get(phone);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { pendingLedgers.delete(phone); return null; }
  return p;
}
function clearPendingLedger(phone) {
  pendingLedgers.delete(phone);
}

// Pending-calendar helpers (multi-turn booking flow — set when bot asks for
// missing date/time, cleared on successful booking or cancel).
function setPendingCalendar(phone, ctx) {
  pendingCalendar.set(phone, { ...ctx, expiresAt: Date.now() + PENDING_CALENDAR_TTL });
  // Opportunistic GC of expired entries.
  for (const [k, v] of pendingCalendar) {
    if (Date.now() > v.expiresAt) pendingCalendar.delete(k);
  }
}
function getPendingCalendar(phone) {
  const p = pendingCalendar.get(phone);
  if (!p) return null;
  if (Date.now() > p.expiresAt) { pendingCalendar.delete(phone); return null; }
  return p;
}
function clearPendingCalendar(phone) {
  pendingCalendar.delete(phone);
}

function autoRouteQuery(query, dbs) {
  const q = query.toLowerCase();
  for (const db of dbs) {
    const name = (db.alias || db.name || '').toLowerCase();
    if (name && q.includes(name.split(' ')[0])) return db;
  }
  for (const db of dbs) {
    const tables = db.tables_metadata || db.schema_json?.tables || [];
    for (const t of tables) {
      const tname = (t.source_name || t.name || '').toLowerCase();
      if (tname && q.includes(tname)) return db;
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════
// INTENT DETECTION
// ════════════════════════════════════════════════════════════════════════
function detectIntent(query) {
  const q = query.trim().toLowerCase();
  if (/^(hi+|hello|hey|hii+|namaste|namaskar|good\s*(morning|evening|night|afternoon)|shubh\s*(prabhat|sandhya))[\s?!.]*$/i.test(q))
    return { intent: 'GREETING', greeting_reply: '🙏 Hello! I am your data assistant. Ask me anything about your data!' };
  if (/^(thanks|thank\s*you|dhanyavaad|shukriya|bye|alvida|ok\s*bye|tata)[\s?!.]*$/i.test(q))
    return { intent: 'GREETING', greeting_reply: '🙏 You are welcome — ask anytime. Happy to help!' };
  if (/^(kaise\s*h[oa]|how\s*are\s*you|khana\s*khay?a|kya\s*h(al|aal)|what('?s)?\s*up|sup|hmm+|accha|theek|sahi)[\s?!.]*$/i.test(q))
    return { intent: 'IGNORE' };
  if (q.length < 3 && !/^\d+$/.test(q)) return { intent: 'CLARIFY_NEEDED' };
  if (/^[1-9]$/.test(q.trim())) return { intent: 'DB_SELECT', choice: parseInt(q.trim()) };
  if (/^(switch|change|badlo|dusra)\s*(db|database|sheet)?/i.test(q)) return { intent: 'SWITCH_DB' };
  return { intent: 'DATA_QUERY' };
}

function detectQueryMode(query) {
  const q = query.toLowerCase();
  if (/chart|graph|visual|trend\s*chart|bar\s*chart|pie\s*chart|line\s*chart|doughnut/i.test(q)) return 'chart';
  // Image mode — match either order: "photo bhejo" / "bhejo photo" / "image dikhao" / "dikhao tasveer"
  // Also catches stand-alone "ka photo" / "image dikhao" without a verb prefix.
  if (
    /(send|bhej|dikhao|share|de\s*do|do\s+do).*(image|photo|tasveer|pic|tasvir)/i.test(q) ||
    /(image|photo|tasveer|pic|tasvir).*(send|bhej|dikhao|share|de\s*do)/i.test(q) ||
    /(ka|ki|ke)\s+(photo|image|tasveer|pic|tasvir)\b/i.test(q)
  ) return 'images';
  if (/pivot/.test(q)) return 'pivot';
  if (/ledger|khata|khaata|khaat[ae]|bahi/i.test(q)) return 'ledger';
  // Calendar — typo-tolerant. Catches "buk", "meeing", "meeking", "meting",
  // "schedul", "appoint" etc. + standard words. \w* allows trailing chars
  // (meeting/meetings/booked/booking/scheduled/appointment).
  if (
    /\b(meet\w*|book\w*|schedul\w*|calendar|appoint\w*|reminder)\b/i.test(q) ||
    /\b(buk|bukk|meeing|meeking|meting|booka|bookd|booed)\b/i.test(q) ||
    /\bcancel\b.*\bmeet/i.test(q) ||
    /aaj\s*ki\s*meet|kal\s*ki\s*meet|aaj\s*ki\s*meeting|kal\s*ki\s*meeting/i.test(q)
  ) return 'calendar';
  return 'data';
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 7.3: IMAGE-COLUMN DETECTION & URL EXTRACTION
// ════════════════════════════════════════════════════════════════════════

// Image URL detection (used at row scan time)
const IMG_URL_RE = /^https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s]*)?$/i;
// Generic URL detection (image columns may host links to images even without an extension, e.g. shopify CDN)
const GENERIC_URL_RE = /^https?:\/\/[^\s]+$/i;
// Column-name match for likely image columns
const IMG_NAME_RE = /image|photo|pic(?!kup)|picture|thumbnail|tasveer|img/i;
const URL_NAME_RE = /url|link|src/i;

/**
 * Inspect tablesMetadata and return the list of columns that look like image URLs.
 * Detection strategy (high-confidence first):
 *   1. samples include a URL ending in .jpg/.png/.webp/etc.   → definite image col
 *   2. column name matches image|photo|pic|thumbnail|img       → image col (even without samples)
 *   3. column name matches url|link/src AND samples are URLs   → likely image col (best effort)
 */
function extractImageColumns(tablesMetadata) {
  const cols = [];
  for (const t of tablesMetadata || []) {
    for (const c of t.columns || []) {
      const samples = (c.samples || []).filter(s => typeof s === 'string' && s);
      const name = (c.original || c.pg_name || '');
      const hasImgUrlSample = samples.some(s => IMG_URL_RE.test(s));
      const isImgNamed = IMG_NAME_RE.test(name);
      const isUrlNamed = URL_NAME_RE.test(name);
      const allSamplesAreUrls = samples.length > 0 && samples.every(s => GENERIC_URL_RE.test(s));

      let confidence = 0;
      if (hasImgUrlSample) confidence = 3;            // explicit image extension in samples
      else if (isImgNamed) confidence = 2;             // column literally named "image"/"photo"
      else if (isUrlNamed && allSamplesAreUrls) confidence = 1; // url-named + URL samples
      if (!confidence) continue;

      cols.push({
        pgTable: t.pg_table,
        pgColumn: c.pg_name,
        original: c.original,
        sourceName: t.source_name,
        confidence,
      });
    }
  }
  // Highest confidence first
  cols.sort((a, b) => b.confidence - a.confidence);
  return cols;
}

/**
 * Scan SQL result rows. For each row, find the first cell that looks like a URL
 * (image extension preferred, fallback to any URL) — that's the image. The first
 * non-URL string cell becomes the caption. Returns [{ url, caption }, ...].
 *
 * Caps at maxItems to avoid spamming WhatsApp.
 */
function extractImageItemsFromRows(rows, maxItems = 20) {
  const items = [];
  for (const row of rows) {
    if (items.length >= maxItems) break;
    const entries = Object.entries(row);

    // Prefer image-extension URLs, then any URL
    let imageUrl = null;
    for (const [, v] of entries) {
      if (typeof v === 'string' && IMG_URL_RE.test(v)) { imageUrl = v; break; }
    }
    if (!imageUrl) {
      for (const [, v] of entries) {
        if (typeof v === 'string' && GENERIC_URL_RE.test(v)) { imageUrl = v; break; }
      }
    }
    if (!imageUrl) continue;

    // Caption: first non-URL string field with content (entity name preferred)
    let caption = '';
    for (const [, v] of entries) {
      if (typeof v === 'string' && v && !GENERIC_URL_RE.test(v)) {
        caption = v;
        break;
      }
    }

    items.push({ url: imageUrl, caption: String(caption).slice(0, 200) });
  }
  return items;
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 6: PROPER-TABLES PIPELINE
// ════════════════════════════════════════════════════════════════════════

/**
 * Build a rich, AI-friendly schema description from tables_metadata.
 */
function buildSchemaPrompt(tablesMetadata) {
  if (!tablesMetadata || !tablesMetadata.length) return '';
  return tablesMetadata.map(t => {
    const cols = (t.columns || []).map(c => {
      const samples = (c.samples || []).slice(0, 3).map(s => JSON.stringify(s)).join(', ');
      return `    ${c.pg_name} ${c.pg_type} [role:${c.role}] (orig "${c.original}")${samples ? ` — e.g. ${samples}` : ''}`;
    }).join('\n');
    return `TABLE "${t.pg_table}" (${t.row_count} rows, source tab: "${t.source_name}"):\n${cols}`;
  }).join('\n\n');
}

/**
 * Detect entity-filter columns (used by fuzzy fallback).
 * Returns [{ pgTable, pgColumn, value }] from a SQL string.
 */
function extractEntityFilters(sql, tablesMetadata) {
  const filters = [];
  const re = /(\w+)\s+ILIKE\s+'%([^%']+)%'/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const colName = m[1].toLowerCase();
    const value = m[2];
    // Find which table this column belongs to + verify role is entity/location
    for (const t of tablesMetadata) {
      const c = (t.columns || []).find(c => c.pg_name.toLowerCase() === colName);
      if (c && (c.role === 'entity' || c.role === 'location')) {
        filters.push({ pgTable: t.pg_table, pgColumn: c.pg_name, value });
        break;
      }
    }
  }
  return filters;
}

/**
 * Single-call AI: PLAN + SQL together. Uses rich schema context.
 * Returns: { sql: string } or { clarify: string } or { not_relevant: true }
 *
 * @param tablesMetadata schema metadata
 * @param query          user message
 * @param prevAttempt    { sql, error } for retry context
 * @param opts           { mode: 'images'|'data'|..., imageCols: [{pgTable, pgColumn, original}] }
 */
async function aiPlanAndSQL(tablesMetadata, query, prevAttempt, opts = {}) {
  const schema = buildSchemaPrompt(tablesMetadata);

  const retryNote = prevAttempt
    ? `\n\nPREVIOUS ATTEMPT FAILED:
SQL: ${prevAttempt.sql}
ERROR: ${prevAttempt.error}
Fix the SQL based on the error.`
    : '';

  // Phase 7.3: when user wants images, instruct AI to include the detected image column.
  let imageNote = '';
  if (opts.mode === 'images' && opts.imageCols && opts.imageCols.length) {
    const list = opts.imageCols.map(c => `${c.pgColumn} (in ${c.pgTable})`).join(', ');
    imageNote = `\n\nIMAGE QUERY MODE:
The user wants product/entity images. The schema has these image-URL columns: ${list}.
The SELECT statement MUST include the image column AND a meaningful name/entity column for caption.
Example pattern: SELECT entity_name, ${opts.imageCols[0].pgColumn} FROM ${opts.imageCols[0].pgTable} WHERE entity_name ILIKE '%term%' AND ${opts.imageCols[0].pgColumn} IS NOT NULL LIMIT 20
Always filter out NULL image URLs. Limit to 20 rows max.`;
  }

  // Phase 7.4: when user wants a chart, instruct AI to write aggregating SQL with
  // exactly two output columns: a label (text/entity/date) and a numeric value.
  let chartNote = '';
  if (opts.mode === 'chart') {
    chartNote = `\n\nCHART QUERY MODE:
The result will be rendered as a chart image. Generate AGGREGATING SQL with EXACTLY 2 columns:
  1. The LABEL column (TEXT — entity name, city, month, category, etc.) — first in SELECT
  2. The VALUE column (NUMERIC — SUM/COUNT/AVG of currency/qty/count) — second in SELECT
Use GROUP BY on the label column.
Use ORDER BY value DESC.
Use LIMIT 12 (charts become unreadable beyond ~12 slices/bars).
Filter NULL labels: WHERE label_col IS NOT NULL AND label_col != ''.
Examples:
  - "monthly sales chart" → SELECT to_char(c_date_actual, 'Mon-YY') AS month, SUM(amount) AS total FROM table WHERE c_date_actual IS NOT NULL GROUP BY 1 ORDER BY MIN(c_date_actual) LIMIT 12
  - "top 5 parties bar chart" → SELECT party_name, SUM(amount) AS total FROM table WHERE party_name IS NOT NULL GROUP BY party_name ORDER BY total DESC LIMIT 5
  - "city wise pie chart" → SELECT city, SUM(amount) AS total FROM table WHERE city IS NOT NULL AND city != '' GROUP BY city ORDER BY total DESC LIMIT 8
NEVER select more than 2 columns in chart mode.`;
  }

  const prompt = `You are an expert PostgreSQL query writer for a multi-tenant chatbot.

USER QUESTION (Hinglish/English/Hindi mix):
"${query}"

AVAILABLE TABLES & COLUMNS:
${schema}

ROLE GLOSSARY:
- role:id        → identifiers (voucher_numbe, hsn_code) — TEXT, never SUM
- role:entity    → names (party, sales person, item) — filter with ILIKE '%term%'
- role:date      → text date "D-Mon-YY" (e.g. "2-Apr-26") — filter with ILIKE
- role:currency  → money (amount, gst, balance)
- role:quantity  → KG/units (qty, weight)
- role:rate      → per-unit rate
- role:location  → city/state
- role:category  → type/group/unit (KG, IMMEDIATE)

CRITICAL RULES:
1. Output ONLY the SQL — no comments, no markdown, no semicolon at end.
   If question is unclear: output exactly "CLARIFY: <one short question in English>"
   If not data-related: output "NOT_RELEVANT"

2. NUMBERS are already cleaned (no commas, no NA — these are actual NUMERIC).
   So just SUM(amount) — no casting needed!

3. NULL HANDLING:
   - Default: ignore nulls in aggregates (SUM/AVG ignore NULL automatically)
   - For entity grouping: WHERE party_name IS NOT NULL (skip blanks)
   - For ORDER BY x DESC LIMIT N: ALWAYS add WHERE x IS NOT NULL (PostgreSQL puts NULLs FIRST in DESC by default)
   - Never show 'NA' / null parties in top-N lists

4. INVOICE COUNTING:
   - Always: COUNT(DISTINCT voucher_numbe)
   - NEVER COUNT(*) — multiple rows per invoice (line items)

5. DATE FILTERING (D-Mon-YY format):
   - Specific day "18 April"  → date ILIKE '18-Apr-%'
   - Month "April 2026"        → date ILIKE '%-Apr-26'
   - Year only "2026"          → date ILIKE '%-26'
   - RELATIVE DATES (last N days, this week, kal, aaj, recent):
     Use the COMPANION column "{date_col}_actual" (DATE type).
     Examples:
       "last 30 days"   → c_date_actual >= CURRENT_DATE - INTERVAL '30 days'
       "this week"      → c_date_actual >= date_trunc('week', CURRENT_DATE)
       "this month"     → c_date_actual >= date_trunc('month', CURRENT_DATE)
       "kal" (yesterday)→ c_date_actual = CURRENT_DATE - INTERVAL '1 day'
   - For month-wise breakdown: GROUP BY date_trunc('month', c_date_actual)

6. TAX / NON-PRODUCT ROWS:
   - item_name like 'Out Put%GST%', '%CGST%', '%SGST%', '%IGST%', 'Rounded Off', 'TCS%' are NOT products
   - For QUANTITY queries: WHERE qty > 0 (skips tax rows automatically)
   - For PRODUCT-LEVEL amount: WHERE item_name NOT ILIKE '%GST%' AND item_name NOT ILIKE 'Rounded%'

7. with_gst_amount REPEATS per invoice across line items.
   - For "total sales WITH GST": SELECT SUM(s.amt) FROM (SELECT DISTINCT voucher_numbe, with_gst_amount AS amt FROM table WHERE ...) s
   - For "highest/biggest single invoice", "sabse bada invoice": use with_gst_amount with DISTINCT subquery — represents the FULL invoice value:
     SELECT party_name, amt AS amount, dt AS date FROM (SELECT DISTINCT voucher_numbe, party_name, with_gst_amount AS amt, c_date AS dt FROM table) s ORDER BY amt DESC LIMIT 1
   - For other amounts (line-item level): use 'amount' column.

8. ENTITY SEARCH (party, sales person, item names):
   - Always ILIKE '%shortest unique part%'
   - For "Sanjay Aggarwal" → ILIKE '%Aggarwal%' (more forgiving)
   - For "BHEL" → ILIKE '%Bharat Heavy%' (expand abbreviations)

9. RESPONSE COLUMNS:
   - Use clear aliases: total_amount, total_qty, invoice_count, party_name, etc.
   - Roles will be inferred from alias name for formatting.

10. NO subqueries unless required. NO CTE / WITH. NO semicolons. LIMIT 200 for lists (so large lists auto-flow into a PDF), no LIMIT for aggregates.

11. SINGLE STATEMENT only. NEVER use ; to chain.

12. "X vs non-X" / "X vs OTHERS" grouping (e.g. "IMMEDIATE vs non-IMMEDIATE"):
   Use CASE WHEN — do NOT filter to one value:
   GOOD: SELECT CASE WHEN invtype = 'IMMEDIATE' THEN 'IMMEDIATE' ELSE 'OTHERS' END AS bucket, COUNT(...) FROM ... GROUP BY bucket
   BAD:  WHERE invtype IN ('IMMEDIATE', 'non-IMMEDIATE')  -- 'non-IMMEDIATE' isn't a real value

13. ENTITY ambiguity: when user names a person/company that could be either party_name OR sales_person_name, search BOTH:
   WHERE (party_name ILIKE '%X%' OR sales_person_name ILIKE '%X%')
   This handles cases like "Sanjay Aggarwal" who may be a sales person, party, or both.

14. INCLUDE ALL REQUESTED METRICS — never drop a column the user asked for:
   If user asks "count + total amount" → SELECT MUST have BOTH count AND amount
   If user asks "qty + amount + invoices" → SELECT MUST have ALL THREE
   Match the user's request exactly. If unsure, include MORE columns rather than fewer.

15. NULL HANDLING IN GROUP BY:
   When grouping by a column that may contain NULL/blank values (city, sales_person, etc):
   ADD: WHERE column IS NOT NULL AND column != ''
   This prevents "blank/null" rows from appearing in results.
   For ORDER BY DESC LIMIT N: also add WHERE numeric_col IS NOT NULL.

16. CROSS-TABLE JOINS (when multiple tables exist like sales + purchases):
   For margin/profit/comparison: JOIN tables on common keys like item_name.
   GOOD: SELECT s.item_name, SUM(s.amount) - SUM(p.amount) AS profit FROM tenant_X_sales s LEFT JOIN tenant_X_purchases p ON s.item_name = p.item_name GROUP BY s.item_name
   Only join when user explicitly asks across-table comparison ("profit", "margin", "buy vs sell").

17. AMOUNT COLUMN SELECTION (line-item vs full-invoice):
   - "line item amount", "per item value", "product amount" → use 'amount' column
   - "invoice value", "total invoice", "sales", "WITH GST", "single invoice value" → use 'with_gst_amount' with DISTINCT subquery
   - Generic "total sales" → use 'with_gst_amount' (full invoice value) by default
   When in doubt, prefer 'with_gst_amount' for invoice-level reporting.

18. LANGUAGE: User may write in Hindi/English/Hinglish — understand all three.
   But all SQL aliases AND all natural-language replies (CLARIFY messages, formatter output)
   MUST be in clean English. The bot ALWAYS replies in English regardless of input language.

19. ADVANCED AGGREGATES:
   - Median: PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY column)
   - Percentile: PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY column)
   - Standard Dev: STDDEV(column)
   - Mode (most common): use a subquery with COUNT and ORDER BY DESC LIMIT 1${retryNote}${imageNote}${chartNote}

OUTPUT (only SQL, no other text):`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 800,
    }),
  });
  const data = await res.json();
  let raw = (data.choices?.[0]?.message?.content || '').trim();
  raw = raw.replace(/```sql?\n?/g, '').replace(/```/g, '').replace(/;\s*$/, '').trim();

  if (/^CLARIFY:/i.test(raw)) return { clarify: raw.replace(/^CLARIFY:\s*/i, '').trim() };
  if (/^NOT_RELEVANT/i.test(raw)) return { not_relevant: true };
  return { sql: raw };
}

/**
 * SQL safety check: must be SELECT, single statement, no DDL/DML.
 */
function validateSQL(sql) {
  if (!sql) return { ok: false, error: 'Empty SQL' };
  const trimmed = sql.trim();
  if (!/^\s*SELECT\b/i.test(trimmed)) return { ok: false, error: 'Not a SELECT statement' };
  if (/;.*\S/.test(trimmed)) return { ok: false, error: 'Multiple statements not allowed' };
  if (/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i.test(trimmed))
    return { ok: false, error: 'Only SELECT allowed' };
  return { ok: true };
}

/**
 * Execute SQL via Supabase RPC.
 */
// ── Run SQL ──
// Phase 10: wrapped in withRetry — auto-retries on TRANSIENT (ECONNRESET / fetch failed / 502/503/429)
// with exponential backoff. SCHEMA / SQL_SYNTAX errors propagate so the outer loop can
// re-prompt the AI or rewrite the column.
async function runSQL(supabase, sql) {
  return await selfHeal.withRetry(
    async () => {
      const { data, error } = await supabase.rpc('execute_sql', { query: sql });
      if (error) throw new Error(error.message);
      return data || [];
    },
    { label: 'tenant-runSQL', maxAttempts: 3, baseDelayMs: 250 }
  );
}

/**
 * Fuzzy-search fallback: when an entity filter matched 0 rows, suggest similar names.
 */
async function fuzzyFallback(supabase, sql, tablesMetadata) {
  const filters = extractEntityFilters(sql, tablesMetadata);
  if (!filters.length) return null;
  const f = filters[0]; // primary filter
  try {
    const { data, error } = await supabase.rpc('tenant_fuzzy_search', {
      p_table: f.pgTable,
      p_column: f.pgColumn,
      p_query: f.value,
      p_limit: 5,
    });
    if (error || !data?.length) return null;
    const matches = data.filter(r => r.score > 0.15).map(r => r.value);
    if (!matches.length) return null;
    return { searchTerm: f.value, matches, column: f.pgColumn };
  } catch (e) {
    return null;
  }
}

/**
 * Find which table the user is querying (by table mention or first table).
 * Returns the tableMetadata object (used by the formatter).
 */
function pickTableMetadata(sql, tablesMetadata) {
  for (const t of tablesMetadata) {
    if (sql.includes(`"${t.pg_table}"`) || sql.includes(t.pg_table)) return t;
  }
  return tablesMetadata[0] || null;
}

/**
 * Combine columns from all tables for formatting (handles JOINs).
 */
function unionColumns(tablesMetadata) {
  const cols = [];
  for (const t of tablesMetadata) for (const c of (t.columns || [])) cols.push(c);
  return cols;
}

// ════════════════════════════════════════════════════════════════════════
// PHASE 7.5: LEDGER MODE
// ════════════════════════════════════════════════════════════════════════

/**
 * Generate the styled ledger PDF for a resolved entity name and return media payload.
 * Used both as the direct path (single match) and as the resolution path after
 * the user picks a number from the disambiguation list.
 */
async function buildLedgerPDFResult(supabase, tenant, ledger, entityName) {
  const rows = await tenantLedger.fetchLedgerForName(supabase, ledger, entityName);
  if (!rows.length) {
    return {
      reply: `📭 No transactions found for "${entityName}".`,
      tenant,
    };
  }

  const pdfPath = await tenantLedgerPdf.generateTenantLedgerPDF(rows, ledger.mapping, {
    entityName,
    dbName: tenant.alias || tenant.name || 'Database',
    tabName: ledger.sourceName || ledger.pgTable,
  });

  // Compute totals for the WhatsApp summary text
  const txns = rows.filter(r => {
    if (!ledger.mapping.particularCol) return true;
    const p = String(r[ledger.mapping.particularCol] || '').trim();
    return p && p !== 'Opening Balance' && p !== 'Closing Balance';
  });
  const totalDr = ledger.mapping.debitCol  ? txns.reduce((s, r) => s + (parseFloat(r[ledger.mapping.debitCol])  || 0), 0) : 0;
  const totalCr = ledger.mapping.creditCol ? txns.reduce((s, r) => s + (parseFloat(r[ledger.mapping.creditCol]) || 0), 0) : 0;
  const closeBal = ledger.mapping.closingBalanceCol
    ? parseFloat(rows[rows.length - 1][ledger.mapping.closingBalanceCol]) || 0
    : (totalDr - totalCr);

  const drCr = closeBal >= 0 ? '(Dr)' : '(Cr)';
  const fmtIN = (n) => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  return {
    reply:
      `📒 *Ledger: ${entityName}*\n` +
      `📝 Transactions: ${txns.length}\n` +
      `💰 Closing Balance: ₹${fmtIN(closeBal)} ${drCr}\n\n` +
      `📄 Sending PDF...`,
    media: { type: 'document', path: pdfPath },
    tenant,
  };
}

/**
 * Main ledger handler.
 * Returns a reply payload (with optional media + pending state side-effects).
 * Cases:
 *   - No ledger-type tables in tenant schema → friendly error
 *   - No entity in query → ask "Kis party ka ledger?"
 *   - 0 matches → "naam nahi mila"
 *   - 1 match → generate PDF directly
 *   - 2-8 matches → return numbered list, set pending state (resolved on next number reply)
 */
async function processLedgerQuery(tenant, query) {
  const supabase = tenant.__supabase;
  const phone = tenant.__phone;
  const tablesMetadata = tenant.tables_metadata || [];

  const ledgers = tenantLedger.detectLedgerTables(tablesMetadata);
  if (!ledgers.length) {
    return {
      reply:
        `📒 No ledger-type table found in this database.\n\n` +
        `For ledger queries, the sheet should have columns like "Debit", "Credit", "Voucher No", "Particular". ` +
        `Or try a regular text query (e.g. "What is Pansari's total sales?").`,
      tenant,
    };
  }

  const entity = tenantLedger.extractEntityFromQuery(query);
  if (!entity) {
    return {
      reply: `📒 Which party/company's ledger do you need? Please specify the name — for example: "Send Pansari Industries' ledger".`,
      tenant,
    };
  }

  // For now, search the first detected ledger table. (Multi-ledger-table tenants are rare.)
  const ledger = ledgers[0];
  const ledgerIdx = 0;

  console.log(`[TENANT LEDGER] table=${ledger.pgTable} nameCol=${ledger.mapping.nameCol} entity="${entity}"`);

  let matches, fuzzy;
  try {
    const r = await tenantLedger.searchLedgerNames(supabase, ledger, entity);
    matches = r.matches;
    fuzzy = r.fuzzy;
  } catch (e) {
    console.error('[TENANT LEDGER SEARCH ERROR]', e.message);
    return { reply: '❌ Ledger search failed. Please try again.', tenant };
  }

  // 0 matches
  if (!matches.length) {
    clearPendingLedger(phone);
    return {
      reply: `📭 No account named "${entity}" found in the ledger. Please check the spelling or try a different name.`,
      tenant,
    };
  }

  // 1 match → generate PDF directly
  if (matches.length === 1) {
    clearPendingLedger(phone);
    const fuzzyNote = fuzzy ? `\n_(Couldn't find an exact match for "${entity}" — using the closest one: ${matches[0]})_\n` : '';
    try {
      const result = await buildLedgerPDFResult(supabase, tenant, ledger, matches[0]);
      if (fuzzyNote && result.reply) result.reply = fuzzyNote + result.reply;
      return result;
    } catch (e) {
      console.error('[TENANT LEDGER PDF ERROR]', e.message);
      return { reply: '❌ Could not generate ledger PDF. Please try again.', tenant };
    }
  }

  // Many matches → disambiguation
  const list = matches.map((n, i) => `${i + 1}. ${n}`).join('\n');
  setPendingLedger(phone, matches, tenant.id, ledgerIdx);
  const header = fuzzy
    ? `📋 No exact match for *${entity}*. Here are similar accounts:`
    : `🏢 Multiple accounts found for *${entity}*:`;
  return {
    reply: `${header}\n\n${list}\n\nReply with a number (1, 2, 3...) to pick one 👆`,
    tenant,
  };
}

/**
 * ── PHASE 6 MAIN PIPELINE ──
 * Plan → SQL → Validate → Execute → (retry on error) → Fuzzy fallback → Format
 */
async function processQueryProperTables(tenant, query) {
  const supabase = tenant.__supabase;  // injected by caller
  const tablesMetadata = tenant.tables_metadata || [];

  if (!tablesMetadata.length) {
    return { reply: '⚠️ This database is not set up yet. Please redo onboarding or contact admin.', tenant };
  }

  // ── Phase 7.3: image-mode pre-flight ──
  // If user asks for photos but no image columns exist, fail fast with a helpful message.
  const mode = detectQueryMode(query);
  let imageCols = [];
  if (mode === 'images') {
    imageCols = extractImageColumns(tablesMetadata);
    if (!imageCols.length) {
      return {
        reply: '🖼️ No photo/image columns available in this database.\n\nIf your sheet has product image URLs (like image_link or photo_url), please re-sync the sheet — or try a text query (e.g. "Send the quantity of Foundation Bolt").',
        tenant,
      };
    }
    console.log(`[TENANT IMAGE MODE] detected ${imageCols.length} image col(s):`, imageCols.map(c => `${c.pgTable}.${c.pgColumn}`).join(', '));
  }

  let lastSQL = '', lastError = '';
  let rows = null;

  // Phase 10.1: build a flat list of all known column names for fuzzy column resolution.
  // When AI hallucinates a column ("total_price"), Levenshtein finds the closest real one.
  const knownColumns = selfHeal.flattenColumnNames(tablesMetadata);

  // ── Retry loop: up to 3 attempts ──
  for (let attempt = 1; attempt <= 3; attempt++) {
    const planResult = await aiPlanAndSQL(
      tablesMetadata,
      query,
      attempt > 1 ? { sql: lastSQL, error: lastError } : null,
      { mode, imageCols }
    );

    if (planResult.clarify) return { reply: `🤔 ${planResult.clarify}`, tenant };
    if (planResult.not_relevant) return { reply: '😊 Please ask something about your data!', tenant };

    let sql = planResult.sql;
    lastSQL = sql;

    const v = validateSQL(sql);
    if (!v.ok) { lastError = `Validation failed: ${v.error}`; console.log('[VALIDATE]', v.error, '|', sql.slice(0, 150)); continue; }

    console.log(`[TENANT SQL ${attempt}]`, sql);
    try {
      rows = await runSQL(supabase, sql);
      break; // success
    } catch (e) {
      lastError = e.message;
      const cls = selfHeal.classifyError(e);
      console.error(`[TENANT SQL ERROR ${attempt}] [${cls.kind}] ${e.message}`);

      // Phase 10.1: SCHEMA_COLUMN error → try to auto-fix the bad column name
      // before re-prompting AI. If we find a confident match, retry that exact attempt
      // with the rewritten SQL so we don't waste an AI call.
      if (cls.kind === 'SCHEMA_COLUMN') {
        const fix = selfHeal.resolveColumnError(e.message, sql, knownColumns);
        if (fix) {
          console.log(`[TENANT COL-FIX] '${fix.badCol}' → '${fix.goodCol}' (score=${fix.score.toFixed(2)})`);
          try {
            rows = await runSQL(supabase, fix.rewrittenSQL);
            lastSQL = fix.rewrittenSQL;  // keep the corrected SQL for downstream (fuzzy fallback etc.)
            break;
          } catch (e2) {
            console.error(`[TENANT COL-FIX FAILED] ${e2.message}`);
            lastError = e2.message;
            // fall through to AI re-prompt
          }
        }
      }

      // Phase 10.6: terminal errors (PERMISSION, SCHEMA_RELATION) — fail fast
      if (cls.kind === 'PERMISSION' || cls.kind === 'SCHEMA_RELATION') {
        return { reply: `⚠️ ${cls.friendly}`, tenant };
      }

      if (attempt === 3) {
        return { reply: '❌ Could not run the query. Please try with simpler/clearer words — e.g. "What is the total sales for April?"', tenant };
      }
    }
  }

  if (!rows) {
    return { reply: '❌ Something went wrong. Please try again or rephrase the question.', tenant };
  }

  // Phase 10.4 (early): treat single-row all-NULL aggregate as "no match" so it
  // flows through the same recovery (fuzzy → relax) as a true 0-row result.
  // Without this, `SUM(amount) WHERE party_name ILIKE '%Pansaree%'` returns one
  // row with NULL → user sees "no data" instead of "did you mean Pansari?".
  const isAllNullAggregate = rows.length === 1 && (() => {
    const r = rows[0];
    const keys = Object.keys(r);
    return keys.length > 0 && keys.every(k => r[k] === null || r[k] === undefined);
  })();
  if (isAllNullAggregate) rows = [];

  // ── 0 rows on entity filter → fuzzy fallback (existing) ──
  if (rows.length === 0) {
    const fuzzy = await fuzzyFallback(supabase, lastSQL, tablesMetadata);
    if (fuzzy && fuzzy.matches.length) {
      const list = fuzzy.matches.map((m, i) => `${i + 1}. ${m}`).join('\n');
      return {
        reply: `📭 No exact match for "${fuzzy.searchTerm}". Did you mean one of these?\n\n${list}\n\nAsk about any of them — or try the correct spelling.`,
        tenant,
      };
    }

    // Phase 10.3: no entity fuzzy match → try relaxed SQL variants
    // (drop date filter / loosen ILIKE / both). Useful when filter combo is over-specific
    // even though no single ILIKE term has a typo (e.g. "Apr 2025 BHEL invoices" but data only has 2026).
    const variants = selfHeal.relaxSQL(lastSQL);
    for (let i = 0; i < variants.length; i++) {
      try {
        console.log(`[TENANT RELAX ${i + 1}/${variants.length}]`, variants[i].slice(0, 200));
        const relaxedRows = await runSQL(supabase, variants[i]);
        if (relaxedRows && relaxedRows.length > 0) {
          rows = relaxedRows;
          lastSQL = variants[i];
          // Tag the result so the caller / formatter knows it's a relaxed answer
          tenant.__relaxed = true;
          console.log(`[TENANT RELAX] succeeded with ${relaxedRows.length} rows`);
          break;
        }
      } catch (e) {
        // relaxed variants are best-effort; ignore failures
      }
    }

    if (!rows || rows.length === 0) {
      return { reply: '📭 No data found. Please check the spelling or try a simpler filter.', tenant };
    }
  }

  // Phase 10.4: result validation — log suspicious results (all-zero aggregates,
  // list-asked-but-1-row). The single-row-all-NULL case was already rerouted into
  // fuzzy/relax recovery above, so this is purely an informational log here.
  const validation = selfHeal.validateResult(rows, query);
  if (!validation.ok) {
    console.log(`[TENANT VALIDATE] ${validation.hint}`);
    // Don't override — these are heuristic warnings, not hard errors.
    // The result is shown as-is so users can see partial data and refine.
  }

  // ── Phase 9.3: chat history logging ──
  // Log the query + final reply text (truncated to 5KB) into tenant_query_logs.
  // Done as a closure so all success-path returns below can use it without each
  // duplicating the insert.
  const logAndReturn = (result) => {
    const replyText = typeof result.reply === 'string' ? result.reply.slice(0, 5000) : null;
    supabase.from('tenant_query_logs').insert({
      tenant_id: tenant.id,
      phone: tenant.__phone || '',
      query,
      sql_generated: lastSQL,
      response: replyText,
      tokens_used: 0,
    }).then(() => {}, () => {});
    supabase.from('tenants')
      .update({ queries_this_month: (tenant.queries_this_month || 0) + 1 })
      .eq('id', tenant.id)
      .then(() => {}, () => {});
    return result;
  };

  // ── Format with type-aware formatter ──
  const sourceTable = pickTableMetadata(lastSQL, tablesMetadata);
  const cols = sourceTable ? sourceTable.columns : unionColumns(tablesMetadata);

  // ── Phase 7.3: Image mode — extract URLs from rows and return as image media ──
  // Server.js call site already handles { media: { type: 'images', items: [...] } } and
  // streams them via the WhatsApp /meta/sendMessage image endpoint.
  if (mode === 'images') {
    const items = extractImageItemsFromRows(rows, 20);
    if (items.length === 0) {
      return logAndReturn({
        reply: `📭 No photos found for "${query}". Please check the spelling or try a simpler filter.`,
        tenant,
      });
    }
    const totalText = items.length < rows.length ? ` (top ${items.length} of ${rows.length})` : '';
    return logAndReturn({
      reply: `📸 Sending *${items.length} photo${items.length === 1 ? '' : 's'}*${totalText}...`,
      media: { type: 'images', items },
      tenant,
    });
  }

  // ── Phase 7.4: Chart mode — render via QuickChart and return as image ──
  // The AI prompt forces 2-column aggregating SQL (label + numeric value, GROUP BY, LIMIT 12).
  if (mode === 'chart') {
    if (rows.length < 2) {
      // A 1-row chart isn't useful — fall through to text formatter
      console.log('[TENANT CHART] Only', rows.length, 'row(s) — skipping chart, using text reply');
    } else {
      try {
        const dbName = tenant.alias || tenant.name || 'Database';
        const chart = await tenantChart.generateTenantChart(rows, query, cols, { dbName });
        console.log(`[TENANT CHART] type=${chart.type} label=${chart.labelCol} value=${chart.valueCol} → ${chart.path}`);
        return logAndReturn({
          reply: `📊 *${chart.title}*\nSending ${rows.length} ${chart.type} chart...`,
          media: { type: 'image', path: chart.path },
          tenant,
        });
      } catch (e) {
        console.error('[TENANT CHART ERROR]', e.message);
        // Fall through to text formatter on any chart failure (network, bad SQL shape, etc.)
      }
    }
  }

  // ── Phase 7.2: Auto-CSV when result is very large (>100 rows) ──
  // CSV is better than PDF here: Excel/Sheets can sort/filter/pivot freely.
  if (rows.length > CSV_ROW_THRESHOLD) {
    try {
      const dbName = tenant.alias || tenant.name || 'Database';
      const title = sourceTable ? (sourceTable.source_name || sourceTable.pg_table) : 'Query Results';
      const csvPath = await tenantCsv.generateTenantCSV(rows, cols, { title, dbName });
      const summary = tenantCsv.buildCsvSummary(rows, cols) || `📊 Sending CSV with *${rows.length} rows*...`;
      console.log(`[TENANT CSV] ${rows.length} rows → ${csvPath}`);
      return logAndReturn({
        reply: summary,
        media: { type: 'document', path: csvPath },
        tenant,
      });
    } catch (e) {
      console.error('[TENANT CSV ERROR]', e.message);
      // Fall through to PDF / AI summary on CSV failure
    }
  }

  // ── Phase 7.1: Auto-PDF when result is large (>50 rows) ──
  // Send a short summary as the WhatsApp text + a styled PDF as a document.
  if (rows.length > PDF_ROW_THRESHOLD) {
    try {
      const dbName = tenant.alias || tenant.name || 'Database';
      const title = sourceTable ? (sourceTable.source_name || sourceTable.pg_table) : 'Query Results';
      const pdfPath = await tenantPdf.generateTenantPDF(rows, cols, {
        title,
        query,
        dbName,
      });
      const summary = tenantPdf.buildPdfSummary(rows, cols) || `📄 Sending PDF with *${rows.length} results*...`;
      console.log(`[TENANT PDF] ${rows.length} rows → ${pdfPath}`);
      return logAndReturn({
        reply: summary,
        media: { type: 'document', path: pdfPath },
        tenant,
      });
    } catch (e) {
      console.error('[TENANT PDF ERROR]', e.message);
      // Fall through to AI summary on PDF failure
    }
  }

  // Big result → AI summarization with pre-formatted values
  if (rows.length > 15) {
    try {
      const reply = await fmt.aiFormat(query, rows, cols);
      return logAndReturn({ reply, tenant });
    } catch (e) {
      // fallback: top 15 list
      const top = rows.slice(0, 15);
      return logAndReturn({ reply: fmt.formatResults(query, top, cols), tenant });
    }
  }

  return logAndReturn({ reply: fmt.formatResults(query, rows, cols), tenant });
}

// ════════════════════════════════════════════════════════════════════════
// LEGACY (JSONB) PIPELINE — kept for tenants without proper tables
// ════════════════════════════════════════════════════════════════════════
async function processQueryLegacy(supabase, phone, query, tenant) {
  // Best-effort fallback using existing JSONB approach
  const schema = tenant.schema_json;
  const tenantId = tenant.id;
  const tables = schema?.tables || [];

  const tableInfo = tables.length
    ? tables.map(t => `TABLE "${t.name}" cols: ${(t.columns || []).filter(c => c.name).map(c => `${c.name} (${c.type})`).join(', ')}`).join('\n')
    : `Single sheet, columns: ${(schema?.columns || []).map(c => c.name).join(', ')}`;

  const prompt = `Generate a PostgreSQL SELECT (no semicolon, no DDL).
Table: tenant_data (tenant_id UUID, table_name TEXT, row_data JSONB)
Access columns: row_data->>'Column Name'
Tenant: '${tenantId}'
${tableInfo}

Numeric cast: NULLIF(REPLACE(REPLACE(row_data->>'col',',',''),'(-)',''),'')::numeric
Filter: WHERE tenant_id='${tenantId}'${tables.length > 1 ? " AND table_name='TABLE'" : ''}

Question: ${query}
Reply with ONLY the SQL.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: 600 }),
  });
  const data = await res.json();
  let sql = (data.choices?.[0]?.message?.content || '').trim();
  sql = sql.replace(/```sql?\n?/g, '').replace(/```/g, '').replace(/;\s*$/, '').trim();

  if (!/^\s*SELECT/i.test(sql)) return { reply: '🤔 I did not understand that. Please give a bit more detail.', tenant };

  console.log('[TENANT LEGACY SQL]', sql);
  try {
    const rows = await runSQL(supabase, sql);
    if (!rows.length) return { reply: '📭 No data found. Please check the spelling.', tenant };
    return { reply: fmt.formatResults(query, rows, []), tenant };
  } catch (e) {
    console.error('[LEGACY SQL ERROR]', e.message);
    return { reply: '❌ Something went wrong. Please try again.', tenant };
  }
}

// ════════════════════════════════════════════════════════════════════════
// PROCESS QUERY (router-level)
// ════════════════════════════════════════════════════════════════════════
async function processQuery(supabase, phone, query, tenant) {
  // Phase 2: if there's a pending calendar context for this phone (the bot
  // previously asked "what date?" or "what time?"), force calendar mode for
  // this turn so the user's plain reply ("27 May", "3 PM", "coming wed")
  // doesn't fall through to a data query.
  if (getPendingCalendar(phone)) {
    if (!tenant.calendar_connected || !tenant.calendar_refresh_token) {
      const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      const authUrl = `${baseUrl}/api/tenant/calendar/auth?tenant_id=${tenant.id}`;
      return { reply: `📅 Calendar is not connected yet.\n\n🔗 Connect here: ${authUrl}\n\nOpen the link → sign in with Google → done!`, tenant };
    }
    return { reply: null, calendarMode: true, tenant };
  }

  const mode = detectQueryMode(query);

  // Calendar mode → caller handles
  if (mode === 'calendar') {
    if (!tenant.calendar_connected || !tenant.calendar_refresh_token) {
      const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      const authUrl = `${baseUrl}/api/tenant/calendar/auth?tenant_id=${tenant.id}`;
      return { reply: `📅 Calendar is not connected yet.\n\n🔗 Connect here: ${authUrl}\n\nOpen the link → sign in with Google → done!`, tenant };
    }
    return { reply: null, calendarMode: true, tenant };
  }

  // Inject context for downstream
  tenant.__supabase = supabase;
  tenant.__phone = phone;

  // Phase 7.5: ledger mode → dedicated handler (proper-tables tenants only)
  if (mode === 'ledger' && tenant.proper_tables_created && tenant.tables_metadata?.length) {
    return await processLedgerQuery(tenant, query);
  }

  // Use NEW proper-tables pipeline if available, else legacy
  if (tenant.proper_tables_created && tenant.tables_metadata?.length) {
    return await processQueryProperTables(tenant, query);
  }
  return await processQueryLegacy(supabase, phone, query, tenant);
}

// ════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════
async function handleTenantQuery(supabase, phone, query) {
  const dbs = await getUserDatabases(supabase, phone);
  if (!dbs.length) return null;

  const { intent, greeting_reply, choice } = detectIntent(query);
  if (intent === 'GREETING') return { reply: greeting_reply, tenant: dbs[0] };
  if (intent === 'IGNORE') return { reply: null, silent: true };
  if (intent === 'CLARIFY_NEEDED') return { reply: '🤔 Could you give a bit more detail — what would you like to know?', tenant: dbs[0] };

  if (intent === 'DB_SELECT') {
    // Phase 7.5: pending-ledger takes priority over DB select.
    // If user has pending ledger options and replies with a number, fetch that ledger.
    const ledgerPending = getPendingLedger(phone);
    if (ledgerPending && choice >= 1 && choice <= ledgerPending.options.length) {
      const selectedName = ledgerPending.options[choice - 1];
      const tenant = dbs.find(d => d.id === ledgerPending.tenantId);
      clearPendingLedger(phone);
      if (!tenant) {
        return { reply: '⚠️ Database context lost. Please try again: "Pansari ledger".', tenant: dbs[0] };
      }
      tenant.__supabase = supabase;
      tenant.__phone = phone;
      const ledgers = tenantLedger.detectLedgerTables(tenant.tables_metadata || []);
      const ledger = ledgers[ledgerPending.ledgerTableIdx || 0] || ledgers[0];
      if (!ledger) {
        return { reply: '⚠️ Ledger table not found. Please try again.', tenant };
      }
      try {
        return await buildLedgerPDFResult(supabase, tenant, ledger, selectedName);
      } catch (e) {
        console.error('[TENANT LEDGER PICK ERROR]', e.message);
        return { reply: '❌ Could not generate ledger PDF. Please try again.', tenant };
      }
    }

    const pending = getPending(phone);
    if (pending && choice >= 1 && choice <= pending.length) {
      const selected = pending[choice - 1];
      setSelectedDB(phone, selected.id);
      clearPending(phone);
      if (selected.id === MIS_MAIN_ID) return { reply: '✅ *MIS Main* selected. Ask about your MIS data now.', tenant: selected };
      return { reply: `✅ *${selected.alias || selected.name}* selected. Ask about this database now.`, tenant: selected };
    }
  }

  if (intent === 'SWITCH_DB') {
    if (dbs.length === 1) return { reply: '📋 You only have 1 database: *' + (dbs[0].alias || dbs[0].name) + '*', tenant: dbs[0] };
    clearSelectedDB(phone);
    const list = dbs.map((d, i) => `${i + 1}️⃣ *${d.alias || d.name}*`).join('\n');
    setPending(phone, dbs);
    return { reply: `📋 Your databases:\n\n${list}\n\nReply with a number to select 👆`, tenant: dbs[0] };
  }

  // Single DB
  if (dbs.length === 1) {
    const tenant = dbs[0];
    if (tenant.id === MIS_MAIN_ID) return null;
    if (tenant.plan === 'free' && tenant.queries_this_month >= (tenant.query_limit || 50))
      return { reply: '⚠️ Free quota exhausted (50/month). Please upgrade to continue! 🚀', tenant };
    return await processQuery(supabase, phone, query, tenant);
  }

  // Multiple DBs
  const selectedId = getSelectedDB(phone);
  if (selectedId) {
    if (selectedId === MIS_MAIN_ID) return null;
    const tenant = dbs.find(d => d.id === selectedId);
    if (tenant) return await processQuery(supabase, phone, query, tenant);
  }

  const autoRouted = autoRouteQuery(query, dbs);
  if (autoRouted) {
    setSelectedDB(phone, autoRouted.id);
    return await processQuery(supabase, phone, query, autoRouted);
  }

  const defaultDb = dbs.find(d => d.is_default);
  if (defaultDb) {
    if (defaultDb.id === MIS_MAIN_ID) return null;
    setSelectedDB(phone, defaultDb.id);
    return await processQuery(supabase, phone, query, defaultDb);
  }

  // Ask user
  const list = dbs.map((d, i) => `${i + 1}️⃣ *${d.alias || d.name}*`).join('\n');
  setPending(phone, dbs);
  return { reply: `📋 You have ${dbs.length} databases:\n\n${list}\n\nWhich one would you like to query? Reply with a number 👆`, tenant: dbs[0] };
}

function invalidateTenantCache(phone) {
  tenantCache.delete(phone);
  tenantCache.delete(`dbs_${phone}`);
}

module.exports = {
  getTenant: getUserDatabases,
  handleTenantQuery,
  invalidateTenantCache,
  // Phase 2 (calendar multi-turn): exposed so server.js calendar handler can
  // remember/clear "waiting for date/time" state across messages.
  setPendingCalendar,
  getPendingCalendar,
  clearPendingCalendar,
  // Phase 11.2: pure helpers exposed for unit tests
  _internal: {
    detectIntent,
    detectQueryMode,
    autoRouteQuery,
    extractEntityFilters,
    validateSQL,
    isMISUser,
    buildSchemaPrompt,
  },
};
