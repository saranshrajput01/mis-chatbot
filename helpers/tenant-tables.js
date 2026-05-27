/**
 * Tenant Proper Tables — Phase 6
 * Replaces JSONB approach with real PostgreSQL tables (typed columns).
 *
 * - Smart type detection (NUMERIC/DATE/TEXT) from column name + samples
 * - Role detection (currency, quantity, count_id, date, entity, percent, etc.) for type-aware formatting
 * - Numeric cleaning at INSERT (commas, "(-)" prefix, parens-negatives, ₹, NA→NULL)
 * - Dynamic CREATE TABLE / ALTER TABLE based on schema
 * - Per-tenant table naming: tenant_{shortid}_{table}
 */

// ─────────────────────────────────────────────────────────────────────────
// TABLE / COLUMN NAME SANITIZATION
// ─────────────────────────────────────────────────────────────────────────

/**
 * Make a string safe for use as a PostgreSQL identifier.
 * snake_case, alphanumeric+underscore only, max 50 chars, can't start with digit.
 */
function sanitizeIdentifier(str) {
  if (!str) return 'col';
  let s = String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')   // non-alphanumeric → _
    .replace(/^_+|_+$/g, '')        // trim leading/trailing _
    .replace(/_+/g, '_')            // collapse multiple _
    .slice(0, 50);
  if (!s) return 'col';
  if (/^\d/.test(s)) s = 'c_' + s;  // can't start with digit
  // Reserved words — prefix with col_
  const reserved = ['select','from','where','order','group','table','user','date','type','default','null','true','false','primary','key','index'];
  if (reserved.includes(s)) s = 'c_' + s;
  return s;
}

/**
 * Build a tenant table name: tenant_{shortid}_{table_name}
 * Total length must be < 63 (Postgres limit).
 */
function buildTenantTableName(tenantId, sourceTableName) {
  const shortId = String(tenantId).replace(/-/g, '').slice(0, 8);
  const tableName = sanitizeIdentifier(sourceTableName);
  return `tenant_${shortId}_${tableName}`.slice(0, 60);
}

// ─────────────────────────────────────────────────────────────────────────
// VALUE CLEANING
// ─────────────────────────────────────────────────────────────────────────

const NULL_TOKENS = new Set(['', 'na', 'n/a', 'null', 'undefined', '-', '--', 'none', 'nil', '#n/a', '#null!', '#div/0!', '#ref!']);

/**
 * Convert raw cell value → cleaned numeric or null.
 * Handles:
 *  - "1,23,456.78" → 123456.78
 *  - "(-)0.40"     → -0.40
 *  - "(123)"       → -123 (accounting negative)
 *  - "₹1,234"      → 1234
 *  - "NA"/"-"/""    → null
 *  - "12.5%"       → 12.5
 */
function cleanNumeric(val) {
  if (val === null || val === undefined) return null;
  let s = String(val).trim();
  if (!s) return null;
  if (NULL_TOKENS.has(s.toLowerCase())) return null;

  // Detect sign markers
  let isNegative = false;
  if (/^\(-\)/.test(s)) { isNegative = true; s = s.replace(/^\(-\)\s*/, ''); }
  if (/^\(.*\)$/.test(s)) { isNegative = true; s = s.slice(1, -1); }       // (123) accounting
  if (/^-/.test(s)) { isNegative = true; s = s.slice(1); }
  if (/^\+/.test(s)) { s = s.slice(1); }

  // Strip currency symbols, commas, % sign, whitespace
  s = s.replace(/[₹$€£¥,\s%]/g, '');

  if (!s || !/^\d*\.?\d+$/.test(s)) return null;

  const n = parseFloat(s);
  if (isNaN(n) || !isFinite(n)) return null;
  return isNegative ? -n : n;
}

/**
 * Clean a text value — keeps original but converts NA tokens to null.
 */
function cleanText(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (NULL_TOKENS.has(s.toLowerCase())) return null;
  return s;
}

/**
 * Parse a date string into a JavaScript Date / null.
 * Supports: "D-Mon-YY", "DD-Mon-YYYY", "YYYY-MM-DD", "DD/MM/YYYY".
 */
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || NULL_TOKENS.has(s.toLowerCase())) return null;

  // D-Mon-YY or DD-Mon-YYYY  e.g. "2-Apr-26", "11-May-2026"
  let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1]);
    const monthMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const month = monthMap[m[2].toLowerCase().slice(0, 3)];
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    if (month === undefined || isNaN(day) || isNaN(year)) return null;
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? null : d;
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (m) {
    const day = parseInt(m[1]), month = parseInt(m[2]) - 1;
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month, day));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Format a Date as ISO date string (YYYY-MM-DD) or null.
 */
function formatDateIso(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Title-case a location/city name. Handles edge cases like "SONEPAT", "sonepat", "New York".
 */
function titleCase(s) {
  if (!s || typeof s !== 'string') return s;
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}

/**
 * Clean per type. Always returns null/string/number — never undefined.
 */
function cleanValue(val, pgType, role) {
  if (pgType === 'NUMERIC') return cleanNumeric(val);
  const cleaned = cleanText(val);
  if (cleaned === null) return null;
  // Normalize location values to Title Case (so "SONEPAT" / "sonepat" / "Sonepat" merge)
  if (role === 'location') return titleCase(cleaned);
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────
// TYPE DETECTION
// ─────────────────────────────────────────────────────────────────────────

/**
 * Detect PostgreSQL type from samples + column name.
 * Returns: 'NUMERIC' | 'TEXT'
 *
 * Strategy:
 *  - If >=60% of non-null samples are numeric (after cleaning) → NUMERIC
 *  - Else → TEXT (covers dates, IDs, names, mixed)
 *  - Override: if column name strongly suggests amount/qty/rate/count, prefer NUMERIC
 *  - Override: explicit ID/voucher/code columns stay TEXT (e.g. "1/2026-27" or HSN codes)
 */
function detectPgType(columnName, samples = []) {
  const nameLower = (columnName || '').toLowerCase();

  // First, never override numeric for these clearly-numeric fields:
  const numericForce = /amount|amt|^value$|price|cost|total|qty|quantity|weight|^rate$|pct|percent|tax|cgst|sgst|igst|cess|discount|profit|margin|debit|credit|balance|score|stock/i;

  // Hard TEXT overrides — column names that look like IDs/codes (even if numeric samples)
  // Check by suffix or contained tokens
  const idTokens = /(^|_|\s)(no|num|number|code|id|hsn|hsncode|gstno|gstn|pincode|pin|phone|mobile|year|hash|irn|ack|acknum|voucher|ewaybill|invoice|bill_?ref|bill_?no)(_|$|\s)/i;
  const idFullName = /^(hsncode|hsn|acknum|ackdate|irnnum|ewaybillnum|gstn|gstin|pan|tan|cin|udyam)$/i;

  if (!numericForce.test(nameLower) && (idTokens.test(nameLower) || idFullName.test(nameLower))) {
    return 'TEXT';
  }

  // Date columns → TEXT (preserve original format like "2-Apr-26")
  if (/^date$|_date$|^date_|timestamp|^time$|_time$/.test(nameLower)) return 'TEXT';

  // Strong NUMERIC name hints
  const numericHint = /amount|amt|value|price|cost|total|sum|sale|revenue|income|expense|debit|credit|balance|qty|quantity|weight|stock|rate|pct|percent|score|count|days|kg|tax|gst|cgst|sgst|igst|cess|discount|profit|margin/i;

  // Sample-based detection
  const nonNull = samples
    .map(s => (s === null || s === undefined) ? '' : String(s).trim())
    .filter(s => s && !NULL_TOKENS.has(s.toLowerCase()));

  if (nonNull.length === 0) {
    // No data — default by name
    return numericHint.test(nameLower) ? 'NUMERIC' : 'TEXT';
  }

  let numericCount = 0;
  for (const s of nonNull) {
    if (cleanNumeric(s) !== null) numericCount++;
  }
  const numericRatio = numericCount / nonNull.length;

  // Strong name hint + at least some numeric samples
  if (numericHint.test(nameLower) && numericRatio >= 0.4) return 'NUMERIC';

  // Pure data-driven
  if (numericRatio >= 0.6) return 'NUMERIC';

  return 'TEXT';
}

// ─────────────────────────────────────────────────────────────────────────
// COLUMN ROLE DETECTION (for type-aware formatting)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Roles tell the formatter how to display values:
 *   currency  → ₹ + Indian commas + L/Cr
 *   quantity  → number + unit (KG, units)
 *   count     → plain number ("12 invoices")
 *   percent   → number + %
 *   date      → as-is (already formatted in source)
 *   id        → raw text (voucher numbers etc)
 *   entity    → name/party (fuzzy-searchable)
 *   text      → plain text
 */
function detectColumnRole(columnName, pgType, samples = []) {
  const n = (columnName || '').toLowerCase();

  // ID-like (always TEXT)
  if (/voucher|invoice.*no|bill.*no|bill_ref|ref_no|id$|^id|hsn|gst.*no|irn|ack|code$/.test(n)) return 'id';

  // Date
  if (/^date$|_date$|^date_|timestamp|time/.test(n) || /^\d{1,2}-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-\d{2,4}$/i.test(samples[0] || '')) return 'date';

  // Currency
  if (pgType === 'NUMERIC' && /amount|amt|price|cost|total|sale|revenue|income|expense|debit|credit|balance|gst|cgst|sgst|igst|tax|cess|discount|profit|margin|fees/.test(n)) return 'currency';

  // Quantity (qty, weight, stock)
  if (pgType === 'NUMERIC' && /qty|quantity|weight|stock|units|count|days|kg/.test(n)) return 'quantity';

  // Percent
  if (pgType === 'NUMERIC' && /pct|percent|rate.*%|%/.test(n)) return 'percent';

  // Rate (per-unit) — currency-like but smaller
  if (pgType === 'NUMERIC' && /^rate$|_rate$|rate_/.test(n)) return 'rate';

  // Entity (party, customer, vendor, person, name)
  if (pgType === 'TEXT' && /name|party|customer|vendor|client|supplier|person|employee|account|particular/.test(n)) return 'entity';

  // City/location
  if (pgType === 'TEXT' && /city|state|country|location|address|area|region/.test(n)) return 'location';

  // Type/category
  if (pgType === 'TEXT' && /type|category|group|class|status|priority|stage|^unit$|uom|level/.test(n)) return 'category';

  // Numeric without clear role
  if (pgType === 'NUMERIC') return 'number';

  return 'text';
}

// ─────────────────────────────────────────────────────────────────────────
// SCHEMA → DDL
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build complete column metadata: pg_name, original_name, pg_type, role.
 * Filters out junk columns (empty headers, URLs in headers).
 *
 * Also: for every column with role 'date', adds a companion DATE column
 *   {pg_name}_actual  (DATE)
 * which is populated at insert time by parseDate(val).
 */
function buildColumnMetadata(rawColumns) {
  const usedNames = new Set(['id', 'created_at', 'updated_at', '_row_id']);
  const cols = [];

  for (const c of rawColumns) {
    const orig = c.name;
    if (!orig || !orig.trim()) continue;
    if (orig.trim().startsWith('http')) continue;
    if (orig.length > 100) continue;

    let pgName = sanitizeIdentifier(orig);
    let attempt = pgName, n = 2;
    while (usedNames.has(attempt)) { attempt = `${pgName}_${n++}`.slice(0, 50); }
    pgName = attempt;
    usedNames.add(pgName);

    const pgType = detectPgType(orig, c.samples || []);
    const role = detectColumnRole(orig, pgType, c.samples || []);

    cols.push({
      original: orig,
      pg_name: pgName,
      pg_type: pgType,
      role,
      samples: (c.samples || []).slice(0, 3),
    });

    // Auto-add companion DATE column for date roles
    if (role === 'date') {
      const dateActualName = (`${pgName}_actual`).slice(0, 50);
      if (!usedNames.has(dateActualName)) {
        usedNames.add(dateActualName);
        cols.push({
          original: `${orig} (parsed)`,
          pg_name: dateActualName,
          pg_type: 'DATE',
          role: 'date_actual',
          source_text_column: pgName,  // tells insertRows where to parse from
          samples: [],
        });
      }
    }
  }
  return cols;
}

/**
 * Generate CREATE TABLE statement.
 */
function buildCreateTableSQL(tableName, columns) {
  const colDefs = columns.map(c => `  "${c.pg_name}" ${c.pg_type}`).join(',\n');
  return `CREATE TABLE IF NOT EXISTS "${tableName}" (
  _row_id BIGSERIAL PRIMARY KEY,
${colDefs}
);`;
}

/**
 * Generate ALTER TABLE ADD COLUMN statements for new columns.
 */
function buildAlterAddColumnSQL(tableName, newColumns) {
  return newColumns.map(c => `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${c.pg_name}" ${c.pg_type};`);
}

/**
 * Generate CREATE INDEX statements for entity/id columns (for fast filtering).
 */
function buildIndexSQL(tableName, columns) {
  const idx = [];
  for (const c of columns) {
    if (c.role === 'entity' || c.role === 'id' || c.role === 'category' || c.role === 'date' || c.role === 'location') {
      const idxName = `idx_${tableName}_${c.pg_name}`.slice(0, 60);
      // BTREE for exact + ILIKE prefix; use lower() functional index for case-insensitive search on entities
      idx.push(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" ("${c.pg_name}");`);
      if (c.role === 'entity') {
        const trgmIdx = `idx_${tableName}_${c.pg_name}_trgm`.slice(0, 60);
        idx.push(`CREATE INDEX IF NOT EXISTS "${trgmIdx}" ON "${tableName}" USING gin ("${c.pg_name}" gin_trgm_ops);`);
      }
    }
  }
  return idx;
}

// ─────────────────────────────────────────────────────────────────────────
// SUPABASE OPERATIONS (using execute_sql RPC)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Execute a SQL command via Supabase. Throws on error.
 */
async function execSQL(supabase, sql) {
  // execute_sql RPC wraps in a SELECT subquery — for DDL we need a different RPC.
  // Use raw fetch to PostgREST or pg_meta — but easiest is the dedicated execute_ddl RPC (added in migration 006).
  const { data, error } = await supabase.rpc('execute_ddl', { sql_command: sql });
  if (error) throw new Error(`execute_ddl: ${error.message} | SQL: ${sql.slice(0, 200)}`);
  return data;
}

/**
 * Run a SELECT and return rows.
 */
async function selectSQL(supabase, sql) {
  const { data, error } = await supabase.rpc('execute_sql', { query: sql });
  if (error) throw new Error(`execute_sql: ${error.message} | SQL: ${sql.slice(0, 200)}`);
  return data || [];
}

/**
 * Check whether a tenant table exists.
 */
async function tableExists(supabase, tableName) {
  const sql = `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${tableName.replace(/'/g, "''")}'`;
  const rows = await selectSQL(supabase, sql);
  return rows.length > 0;
}

/**
 * Get existing column names of a tenant table.
 */
async function getExistingColumns(supabase, tableName) {
  const sql = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${tableName.replace(/'/g, "''")}'`;
  const rows = await selectSQL(supabase, sql);
  return rows.map(r => r.column_name);
}

/**
 * Create or alter a tenant table to match the desired schema.
 * Returns: { created: bool, addedColumns: [...] }
 */
async function ensureTable(supabase, tableName, columns) {
  const exists = await tableExists(supabase, tableName);
  if (!exists) {
    const sql = buildCreateTableSQL(tableName, columns);
    await execSQL(supabase, sql);
    // Add indexes
    for (const idxSql of buildIndexSQL(tableName, columns)) {
      try { await execSQL(supabase, idxSql); } catch (e) { console.log('[INDEX]', e.message); }
    }
    return { created: true, addedColumns: columns.map(c => c.pg_name) };
  }
  // Add new columns if any
  const existing = (await getExistingColumns(supabase, tableName)).map(c => c.toLowerCase());
  const newCols = columns.filter(c => !existing.includes(c.pg_name.toLowerCase()));
  if (newCols.length) {
    for (const sql of buildAlterAddColumnSQL(tableName, newCols)) {
      try { await execSQL(supabase, sql); } catch (e) { console.log('[ALTER]', e.message); }
    }
  }
  return { created: false, addedColumns: newCols.map(c => c.pg_name) };
}

/**
 * Drop a tenant table (used when tab is removed or full re-create needed).
 */
async function dropTable(supabase, tableName) {
  await execSQL(supabase, `DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
}

/**
 * Truncate a tenant table (full re-load).
 */
async function truncateTable(supabase, tableName) {
  try { await execSQL(supabase, `TRUNCATE TABLE "${tableName}" RESTART IDENTITY;`); }
  catch (e) { console.log('[TRUNCATE]', e.message); }
}

/**
 * Insert cleaned rows into a tenant table.
 *
 * @param rows array of { [originalHeader]: rawValue }
 * @param columns array of { original, pg_name, pg_type, role }
 */
async function insertRows(supabase, tableName, rows, columns) {
  if (!rows.length) return 0;

  // Map original header → column meta (skip companion DATE columns)
  const headerToCol = new Map();
  for (const c of columns) if (c.original && !c.source_text_column) headerToCol.set(c.original, c);

  // Date-actual companion columns (populated by parsing source text col)
  const dateActualCols = columns.filter(c => c.role === 'date_actual' && c.source_text_column);

  const cleaned = rows.map(row => {
    const obj = {};
    // Pass 1: regular columns (with role-aware cleaning)
    for (const [origHeader, val] of Object.entries(row)) {
      const c = headerToCol.get(origHeader);
      if (!c) continue;
      obj[c.pg_name] = cleanValue(val, c.pg_type, c.role);
    }
    // Pass 2: date_actual columns — read source text col, parse to ISO date
    for (const dc of dateActualCols) {
      const sourceCol = columns.find(cc => cc.pg_name === dc.source_text_column);
      if (!sourceCol) continue;
      const rawDateText = row[sourceCol.original];
      const parsed = parseDate(rawDateText);
      obj[dc.pg_name] = formatDateIso(parsed);
    }
    return obj;
  });

  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < cleaned.length; i += batchSize) {
    const batch = cleaned.slice(i, i + batchSize);
    const { error } = await supabase.from(tableName).insert(batch);
    if (error) {
      console.error(`[INSERT ERROR] ${tableName} batch ${i}: ${error.message}`);
      // Try one-by-one as fallback to skip individual bad rows
      for (const r of batch) {
        const { error: e2 } = await supabase.from(tableName).insert(r);
        if (!e2) inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }
  return inserted;
}

// ─────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────

module.exports = {
  // Identifiers
  sanitizeIdentifier,
  buildTenantTableName,
  // Cleaning
  cleanNumeric,
  cleanText,
  cleanValue,
  parseDate,
  formatDateIso,
  titleCase,
  NULL_TOKENS,
  // Type/role detection
  detectPgType,
  detectColumnRole,
  buildColumnMetadata,
  // DDL builders
  buildCreateTableSQL,
  buildAlterAddColumnSQL,
  buildIndexSQL,
  // DB ops
  execSQL,
  selectSQL,
  tableExists,
  getExistingColumns,
  ensureTable,
  dropTable,
  truncateTable,
  insertRows,
};
