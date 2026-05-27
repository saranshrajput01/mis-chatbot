// Load .env only for local development (Railway has native env vars)
if (!process.env.RAILWAY_ENVIRONMENT) {
  require("dotenv").config();
}

// Boot-time env sanity check (silent on success, errors only)
const _required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY', 'WA_ACCESS_TOKEN', 'WA_PHONE_ID'];
const _missing = _required.filter(k => !process.env[k]);
if (_missing.length) console.error('[BOOT] Missing required env vars:', _missing.join(', '));

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const os = require("os");
const gcal = require("./calendar");
const smartFormat = require("./helpers/smart-format");
const selfHeal = require("./helpers/self-heal");  // Phase 10: classifyError, withRetry, resolveColumnError, relaxSQL, validateResult, pingDb

const app = express();

// Phase 22 Sprint 1.6 — CORS origins from env (comma-separated). Defaults to
// localhost for safety so a misconfigured deploy doesn't accidentally allow
// every origin. Add your production domain to CORS_ORIGINS in .env.
const _corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({ origin: _corsOrigins, credentials: true }));

// Phase 22 Sprint 1.5 — capture raw request body for HMAC verification of
// signed webhooks (WhatsApp X-Hub-Signature-256). Stash on req.rawBody
// before JSON parsing consumes the stream.
const _captureRaw = (req, _res, buf) => { if (buf && buf.length) req.rawBody = buf; };
app.use(express.json({ limit: "50mb", verify: _captureRaw }));
app.use(express.urlencoded({ limit: "50mb", extended: true, verify: _captureRaw }));

// ════════════════════════════════════════════════════════════════════════════
// PHASE 20 — Clean URL routes for the new dashboard UI (must come before
// express.static so the static middleware doesn't auto-serve index.html for "/").
//   /              → smart redirect (login if no phone, dashboard if logged in)
//   /login         → public/login.html
//   /register      → public/register.html
//   /dashboard     → public/dashboard.html (auth enforced client-side)
//   /chat          → public/chat.html       (Sprint 3 — premium ChatOS)
//   /chat-legacy   → public/index.html      (rollback safety net for Sprint 3)
// ════════════════════════════════════════════════════════════════════════════
const _path = require("path");
const _publicDir = _path.join(__dirname, "public");
app.get("/login",       (req, res) => res.sendFile(_path.join(_publicDir, "login.html")));
app.get("/register",    (req, res) => res.sendFile(_path.join(_publicDir, "register.html")));
app.get("/dashboard",   (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(_path.join(_publicDir, "dashboard.html"));
});

// Sprint 4 — drill-down page routes. Same no-store treatment as /dashboard.
function _serveNoStore(file) {
  return (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.sendFile(_path.join(_publicDir, file));
  };
}
app.get("/sales",       _serveNoStore("sales.html"));
app.get("/outstanding", _serveNoStore("outstanding.html"));
app.get("/stock",       _serveNoStore("stock.html"));
app.get("/ledger",      _serveNoStore("ledger.html"));
app.get("/settings",    _serveNoStore("settings.html"));
app.get("/calendar",    _serveNoStore("calendar.html"));
app.get("/reports",     _serveNoStore("reports.html"));
app.get("/chat",        (req, res) => res.sendFile(_path.join(_publicDir, "chat.html")));
app.get("/chat-legacy", (req, res) => res.sendFile(_path.join(_publicDir, "index.html")));
// Smart redirect at root — uses localStorage on the client to decide.
app.get("/", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.send(`<!doctype html><html><head><meta charset="utf-8"><title>MIS</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#FBFBFD;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#86868B;display:grid;place-items:center}@media (prefers-color-scheme:dark){html,body{background:#000;color:#A1A1A6}}</style></head><body><div>Loading…</div><script>(function(){try{var p=localStorage.getItem('mis_phone');location.replace(p?'/dashboard':'/login');}catch(e){location.replace('/login');}})();</script></body></html>`);
});

// Static asset serving (but disable directory-index so "/" hits our handler above)
// `etag: false` + cache-busting headers so dev iterations on JS/CSS reach the
// browser without forcing private-window reloads. Safe for production too —
// our HTML pages are tiny and re-fetching CSS/JS on each load is negligible.
app.use(express.static(require("path").join(__dirname, "public"), {
  index: false,
  etag: false,
  lastModified: true,
  setHeaders: (res, path) => {
    if (/\.(js|css|html)$/i.test(path)) {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    }
  }
}));

app.use((req, res, next) => {
  console.log("\n========== NEW REQUEST ==========");
  console.log("[TIME]", new Date().toISOString());
  console.log("[METHOD]", req.method);
  console.log("[URL]", req.originalUrl);
  console.log("[BODY]", JSON.stringify(req.body, null, 2));
  next();
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

let liveSchema = "";
let liveColumnsByTable = {};  // Phase 10: { sales: ['id','company_name',...], ... } — used by column resolver

// ── RATE LIMITING ──────────────────────────────────────────────────────────
// Phase 22 Sprint 1.7 — proper IP extraction (handles proxy chains where
// X-Forwarded-For is "client, proxy1, proxy2" — first entry is the real
// client) plus a Retry-After helper so 429 responses are well-formed.
const rateLimits = new Map(); // key → { count, resetAt }
function rateLimit(key, maxRequests = 20, windowSec = 60) {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return false; // not limited
  }
  entry.count++;
  if (entry.count > maxRequests) return true; // limited
  return false;
}

// Compute seconds until the rate-limit window resets for a given key
// (used to populate the Retry-After header on 429 responses).
function rateLimitRetryAfter(key) {
  const entry = rateLimits.get(key);
  if (!entry) return 60;
  return Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
}

// Extract the actual client IP from a request, gracefully handling
// X-Forwarded-For proxy chains and IPv6 prefixes.
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first.replace(/^::ffff:/, '');
  }
  const sock = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return String(sock).replace(/^::ffff:/, '') || 'unknown';
}

// ── KNOWN-TENANT CACHE (Phase 9.1) ─────────────────────────────────────────
// Tenants whose phone is NOT in MIS access_control.json must still be allowed
// past the access gate. This 5-minute in-memory cache avoids a DB roundtrip on
// every WhatsApp message. We only store positive results (known tenants).
const tenantPhoneCache = new Map(); // phone → ts when last verified
const TENANT_PHONE_CACHE_TTL = 5 * 60 * 1000;
async function isKnownTenant(phone) {
  if (!phone) return false;
  const cached = tenantPhoneCache.get(phone);
  if (cached && Date.now() - cached < TENANT_PHONE_CACHE_TTL) return true;
  try {
    const { data: t } = await supabase.from('tenants').select('id').eq('phone', phone).maybeSingle();
    if (t) { tenantPhoneCache.set(phone, Date.now()); return true; }
    const { data: m } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).maybeSingle();
    if (m) { tenantPhoneCache.set(phone, Date.now()); return true; }
  } catch (_) {}
  return false;
}
// Cleanup stale entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) { if (now > v.resetAt) rateLimits.delete(k); }
  // Also clean expired query cache entries
  for (const [k, v] of queryCache) { if (now - v.ts > CACHE_TTL) queryCache.delete(k); }
}, 300000);

// ── API KEY AUTH MIDDLEWARE ─────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key || key !== process.env.ADMIN_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── ACCESS CONTROL ─────────────────────────────────────────────────────────
// Modes: ALL (everyone can query everything), LIMITED (user sees own data only), LIST (whitelist only)
//
// Phase 22 Sprint 1.8 — in-memory cache. The previous implementation did
// fs.readFileSync on EVERY incoming request which blocks the event loop
// under load. Now we read once at boot and rely on fs.watch to refresh
// whenever the file changes (admin save via /access endpoint, or manual
// edit). Falls back to a fresh read if cache is null.
const _ACCESS_PATH = path.join(__dirname, "access_control.json");
let _accessCache = null;
function _readAccessFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(_ACCESS_PATH, "utf8"));
  } catch (e) {
    return { mode: "ALL", allowed_numbers: [], users: {} };
  }
}
function _refreshAccessCache() {
  _accessCache = _readAccessFromDisk();
}
_refreshAccessCache();
try {
  fs.watch(_ACCESS_PATH, { persistent: false }, (eventType) => {
    if (eventType === 'change' || eventType === 'rename') {
      // Tiny debounce — editors often emit multiple events per save.
      setTimeout(_refreshAccessCache, 50);
    }
  });
} catch (e) {
  console.warn('[ACCESS-CACHE] fs.watch unavailable, using cache without auto-reload:', e.message);
}

function loadAccessControl() {
  return _accessCache || _readAccessFromDisk();
}
function checkAccess(phone) {
  const ac = loadAccessControl();
  const user = ac.users[phone];
  // Global mode check
  if (ac.mode === "LIST") {
    if (!user && !ac.allowed_numbers.includes(phone)) return { allowed: false };
  }
  return { allowed: true, mode: user?.access || ac.mode, name: user?.name || "" };
}

// ── FIX #8: Session store for WP ──────────────────────────────────────────
// Stores: pending ledger selections, pending image sends, image send stop flag
// Persistent sessions: in-memory + Supabase sync (restart-safe)
let wpSessions = {};
async function loadSessionsFromDB() {
  try {
    const { data } = await supabase.from("wp_sessions").select("phone,data");
    if (data) data.forEach(r => { wpSessions[r.phone] = r.data; });
    console.log("[SESSIONS] Loaded", Object.keys(wpSessions).length, "from Supabase");
  } catch(e) { console.error("[SESSIONS] Load error:", e.message); }
}
function saveSession(phone) {
  const val = wpSessions[phone];
  if (val) supabase.from("wp_sessions").upsert({ phone, data: val, updated_at: new Date().toISOString() }).then(() => {});
  else supabase.from("wp_sessions").delete().eq("phone", phone).then(() => {});
}
loadSessionsFromDB();

// ── MESSAGE LOGGING ───────────────────────────────────────────────────────
function logMessage(platform, direction, message, { phone, session_id, message_type } = {}) {
  supabase.from("message_logs").insert({ platform, direction, message: (message||"").slice(0, 5000), phone, session_id, message_type: message_type || "text" }).then(() => {});
}

// ── QUERY CACHE (5 min TTL) ───────────────────────────────────────────────
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
function getCached(key) { const e = queryCache.get(key); if (!e) return null; if (Date.now() - e.ts > CACHE_TTL) { queryCache.delete(key); return null; } return e.val; }
function setCache(key, val) { queryCache.set(key, { val, ts: Date.now() }); if (queryCache.size > 200) { const first = queryCache.keys().next().value; queryCache.delete(first); } }
// wpSessions[phone] = {
//   type: 'ledger_select' | 'image_confirm' | 'image_sending',
//   options: [],         // for ledger_select
//   products: [],        // for image_confirm / image_sending
//   sendingIndex: 0,     // for image_sending (current progress)
//   stopFlag: false      // for image_sending (user typed "stop")
// }

async function fetchLiveSchema() {
  try {
    console.log("[SCHEMA] Calling execute_sql RPC...");
    const { data, error } = await supabase.rpc("execute_sql", {
      query: `SELECT table_name, column_name, data_type
              FROM information_schema.columns
              WHERE table_schema = 'public'
              AND table_name IN ('sales','expenses','pending','ledger','products','delegation_tasks','checklist_tasks','scores')
              ORDER BY table_name, ordinal_position`
    });
    if (error || !data) { 
      console.error("[SCHEMA] RPC Error:", JSON.stringify(error, null, 2)); 
      return; 
    }
    const tables = {};
    data.forEach(r => {
      if (!tables[r.table_name]) tables[r.table_name] = [];
      tables[r.table_name].push(r.column_name + " (" + r.data_type + ")");
    });
    liveSchema = "=== ACTUAL DATABASE COLUMNS ===\n";
    Object.entries(tables).forEach(([tbl, cols]) => {
      liveSchema += "TABLE public." + tbl + ":\n  " + cols.join(", ") + "\n\n";
    });
    // Phase 10: bare column-name map for the self-heal column resolver
    liveColumnsByTable = {};
    data.forEach(r => {
      if (!liveColumnsByTable[r.table_name]) liveColumnsByTable[r.table_name] = [];
      liveColumnsByTable[r.table_name].push(r.column_name);
    });
    console.log("[SCHEMA] Live schema loaded:", Object.keys(tables).join(", "));
  } catch(e) {
    console.error("[SCHEMA] Error:", e.message);
  }
}

async function openai(systemPrompt, messages, maxTokens = 3000) {
  // Debug: Check if API key is loaded
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("[OPENAI DEBUG] Key exists:", !!apiKey);
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: maxTokens,
        temperature: 0.1,
        messages: [{ role: "system", content: systemPrompt }, ...messages]
      }),
      signal: controller.signal
    });
    const d = await response.json();
    if (!response.ok) throw new Error(d.error?.message || JSON.stringify(d));
    return d.choices?.[0]?.message?.content || "";
  } finally { clearTimeout(timeout); }
}

function fmtAmt(n) {
  const num = parseFloat(String(n || "").replace(/[₹,]/g, "")) || 0;
  return "Rs. " + num.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d).split("T")[0];
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return String(dt.getDate()).padStart(2,"0") + "-" + M[dt.getMonth()] + "-" + String(dt.getFullYear()).slice(2);
}

function fmtMonth(ym) {
  if (!ym) return ym;
  const [y, m] = String(ym).split("-");
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return M[parseInt(m) - 1] + "-" + String(y).slice(2);
}

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
function buildSystemPrompt(isWhatsApp = false) {
  return `You are an expert Sales & Finance Assistant for "Mis Work India Private Limited".
Today: ${new Date().toISOString().split("T")[0]}. Financial year: Apr 2025 – Mar 2026 (FY 2025-26).
Current month: ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}.

${liveSchema}

=== IMPORTANT BEHAVIOR ===
- ALWAYS try to answer. Only use clarify if truly ambiguous (2+ possible tables).
- If query is vague ("sales dikhao"), default to summary: SUM + COUNT for current FY.
- NEVER return empty sql field. Always generate valid SQL.
- If unsure which table, pick the most likely one based on keywords.
- JSON output only. No markdown, no explanation outside JSON.

=== SMART SEARCH RULES (CRITICAL — applies to ALL tables) ===
- When user mentions a name/company/person, extract the MOST DISTINCTIVE keyword and use ILIKE '%keyword%'
- Example: "ajanta water bottle ki sales" → company_name ILIKE '%ajanta%' (not the full phrase)
- Example: "pansari industries pending" → party_name ILIKE '%pansari%'
- Example: "shammi ji ki sales" → sales_person ILIKE '%shammi%' OR company_name ILIKE '%shammi%'
- NEVER use exact match (=). ALWAYS use ILIKE with % wildcards.
- NEVER put the entire user phrase in one ILIKE. Extract just the key name word.
- Search name columns first: company_name (sales), party_name (expenses/pending/ledger), employee_name (scores), delegated_to (delegation), assigned_to (checklist)
- If no match might exist in name column, try OR with other text columns
- For amounts: use SUM(column::numeric) for totals, never return raw rows unless user asks for list/detail

=== SCHEMA NOTES ===
TABLE: public.sales
  columns: invoice_no, company_name, address, state, gst_no, contact_person, phone, description, total_price, category, invoice_pdf, created_at
  category values: 'GOOGLE SHEET - RETAINERSHIP','GOOGLE SHEET - CUSTOM','GOOGLE SHEET - READY','GOOGLE SHEET - AMC','PHP - PANSARI','PHP - OTHERS','WHATSAPP CREDIT','WA Wallet','ERP - CALL SYSTEM','ERP - READY PRODUCTS','MOBILE APP - PANSARI','MOBILE APP - OTHERS','WEB FORM','TALLY'

TABLE: public.expenses
  columns: date, voucher_no, party_name, grp, sub_group, design_number, amount, type
  *** CRITICAL: Employee name is in "design_number" column for salary entries ***
  *** salary query: WHERE sub_group ILIKE '%salary%' ***
  *** specific employee: WHERE sub_group ILIKE '%salary%' AND design_number ILIKE '%name%' ***
  sub_group values: 'Salary','OFFICE RENT','Phone and Internet','Technical Exp','Travel Exp','Utility Direc','INSURANCE','Repair & Maintenance','BRANDING EXP','COMMISSION EXP','Stationery','Legal & Prof Exp','Employees Welfare','Financial Exp','Computer Maintenance','Bad Debts','OFFICE EXP','Telephone Exp','Indirect Expenses','Other Expense'

TABLE: public.pending
  columns: bill_date, bill_ref_no, party_name, party_group, sub_group, sales_person, pending_amount, due_date, overdue_days
  *** CRITICAL: sales_person column stores the salesperson name ***
  *** "Shammi Ji", "Shammi ji", "Shammi" all refer to sales_person ILIKE '%shammi%' ***
  *** Always use ILIKE for sales_person searches ***

TABLE: public.ledger
  columns: name, subgroup, state, email, contact_person, mobile, opening_balance, voucher_date, voucher_particular, voucher_type, voucher_no, voucher_debit, voucher_credit, closing_balance

TABLE: public.products
  columns: id, item_name, image_link, description
  *** For image requests: return ALL matching products ***
  *** For list requests: LIMIT 200, no description needed ***

TABLE: public.delegation_tasks
  columns: id, del_task_id, plan_date, final_date, delegate_from, delegated_to,
           project_name, task_name, del_remarks, priority, department_id, del_url
  *** delegated_to = task kisko diya gaya hai ***
  *** delegate_from = kisne diya ***
  *** ALWAYS extract the person's first name from query and search with ILIKE ***
  *** ALWAYS search BOTH columns: ***
  *** WHERE delegated_to ILIKE '%firstname%' OR delegate_from ILIKE '%firstname%' ***
  *** NEVER use exact match, ALWAYS ILIKE ***
  *** Examples: ***
  ***   "Tanvi ke tasks" → ILIKE '%tanvi%' ***
  ***   "Monu kumar tasks" → ILIKE '%monu%' ***
  ***   "Saloni ki delegation" → ILIKE '%saloni%' ***
  *** If 0 results, also search checklist_tasks: ***
  ***   SELECT task_name, assigned_to, status, priority FROM checklist_tasks WHERE assigned_to ILIKE '%firstname%' ***

TABLE: public.checklist_tasks
  columns: id, task_name, assigned_to, status, priority, remarks, department

TABLE: public.scores
  columns: id, employee_name, score_value, category, period, remarks
  score_value is TEXT — never AVG() or SUM()

=== WHATSAPP MODE RULES ===
${isWhatsApp ? `
- query_type:"chart" ONLY if user EXPLICITLY says one of these words: "chart", "graph", "visual", "trend chart", "bar chart", "pie chart", "line chart"
- ALL other data queries → query_type:"data" — even if about time ranges, trends, last X days
- "last 30 days expenses" → query_type:"data" (NOT chart!)
- "month-wise sales" → query_type:"data" (NOT chart!)
- For "kitne transactions", "count karo" etc → query_type:"data" with COUNT sql
- For product list/images → query_type:"data" with products table sql
` : `
- chart if user says chart/graph/visual/trend/bar/pie/line/doughnut
`}

=== SALARY RULES (CRITICAL) ===
- "top salary wale bande" = GROUP BY design_number, show individual employees
- SELECT design_number as employee_name, SUM(amount) as total_salary FROM expenses WHERE sub_group ILIKE '%salary%' AND design_number != '' AND design_number NOT ILIKE '%remuneration%' AND design_number NOT ILIKE '%office%' GROUP BY design_number ORDER BY total_salary DESC LIMIT 5
- "X ki salary" = WHERE sub_group ILIKE '%salary%' AND design_number ILIKE '%X%' GROUP BY TO_CHAR(date,'YYYY-MM') ORDER BY month
- "month mein salary" = GROUP BY month, SUM all salary entries that month

=== PENDING RULES (CRITICAL) ===
- "Shammi ji" / "Shami ji" / "Shammi" → sales_person ILIKE '%shammi%'
- Always search sales_person with ILIKE, never exact match
- "pending payments" → SELECT party_name, SUM(pending_amount) as total_pending, COUNT(*) as bills, MAX(overdue_days) as max_overdue FROM pending GROUP BY party_name ORDER BY total_pending DESC

=== DELEGATION TASK RULES ===
- Search BOTH delegated_to AND delegate_from with ILIKE
- Return: task_name, delegated_to, delegate_from, priority, plan_date, final_date, del_remarks
- If name not found in delegation_tasks, also check checklist_tasks assigned_to

=== PRODUCT RULES ===
- image request → SELECT item_name, image_link, description FROM products WHERE item_name ILIKE '%X%' OR description ILIKE '%X%' ORDER BY item_name (NO LIMIT for image requests)
- list request → SELECT id, item_name, image_link FROM products ORDER BY item_name LIMIT 200

=== PIVOT TABLE RULES (CRITICAL) ===
- "sales data party-wise with months" / "month-wise sales" / "12 months ka data" → MUST return pivot format:
  SELECT 
    company_name as party_name,
    TO_CHAR(created_at, 'YYYY-MM') as month,
    SUM(total_price) as total
  FROM sales
  WHERE created_at >= '2025-04-01'
  GROUP BY company_name, TO_CHAR(created_at, 'YYYY-MM')
  ORDER BY company_name, month
- CRITICAL: If user asks for "months" or "apr 2025, may 2025..." → MUST include "month" column
- ALWAYS include month column for time-series data
- For expenses month-wise BY CATEGORY → Use this:
  SELECT 
    sub_group as category,
    TO_CHAR(date, 'YYYY-MM') as month,
    SUM(amount) as total
  FROM expenses
  WHERE date >= '2025-04-01'
  GROUP BY sub_group, TO_CHAR(date, 'YYYY-MM')
  ORDER BY sub_group, month
- "expense category mein month-wise" → category as first col, months as columns
- NEVER give just party_name + total without month breakdown when months are requested

=== MULTI-COLUMN QUERIES (CRITICAL) ===
- When user asks for MULTIPLE specific columns, INCLUDE ALL of them in SELECT
- "invoice no, amount, gst, link, timestamp" → SELECT invoice_no, total_price, gst_amount, invoice_pdf, created_at
- For sales table specifically:
  - invoice_no → invoice_no
  - amount → total_price  
  - gst → check if gst_amount column exists, else extract from total
  - invoice link → invoice_pdf
  - timestamp/date → created_at
- ALWAYS include ALL requested columns, never skip any

=== LINK COLUMNS (CRITICAL — always include if table has them) ===
- sales table → ALWAYS include invoice_pdf in SELECT
- delegation_tasks table → ALWAYS include del_url in SELECT
- products table → ALWAYS include image_link in SELECT
- These link columns MUST be included even if user didn't explicitly ask for them

=== RELATIVE DATE RULES (CRITICAL) ===
- "last 30 days" / "pichle 30 din" → WHERE date >= CURRENT_DATE - INTERVAL '30 days'
- "last week" / "pichle hafte" → WHERE date >= CURRENT_DATE - INTERVAL '7 days'
- "last month" / "pichla mahina" → WHERE date >= CURRENT_DATE - INTERVAL '1 month'
- "last 3 months" → WHERE date >= CURRENT_DATE - INTERVAL '3 months'
- "this month" / "is mahine" → WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
- "this year" / "is saal" → WHERE date >= '2025-04-01' (financial year)
- "yesterday" / "kal" → WHERE date = CURRENT_DATE - INTERVAL '1 day'
- "today" / "aaj" → WHERE date = CURRENT_DATE
- For sales table use created_at, for expenses use date, for pending use bill_date
- CRITICAL: Relative date queries are ALWAYS query_type:"data", NEVER "chart"

=== SQL RULES ===
- NEVER filter NULL columns without fallback
- Only SELECT statements
- ILIKE for all text searches
- ROUND(SUM(amount)::numeric,0) for amounts
- TO_CHAR(date_col,'YYYY-MM') as month for grouping
- LIMIT 100 unless products (LIMIT 200) or aggregating
- ALWAYS cast amount to numeric before SUM: SUM(amount::numeric)
- For total_price (sales): SUM(total_price::numeric)
- For pending_amount: SUM(pending_amount::numeric)
- NEVER use column aliases in WHERE — use the actual column name
- GROUP BY must include all non-aggregated SELECT columns
- For "total" / "kitni" → single SUM row (no GROUP BY unless asked)
- For "list" / "dikhao" / "batao" → detail rows with LIMIT
- COALESCE(column, 0) when column might be NULL in aggregations

=== ADVANCED RULES (Phase 8 backport) ===
- NULL handling in TOP-N: PostgreSQL puts NULLs FIRST in DESC. For "top X" / "highest" / "sabse zyada":
  ALWAYS add WHERE <numeric_col> IS NOT NULL AND <name_col> IS NOT NULL AND <name_col> != ''
  Example: SELECT party_name, SUM(amount::numeric) FROM expenses WHERE party_name IS NOT NULL AND party_name != '' GROUP BY party_name ORDER BY SUM(amount::numeric) DESC LIMIT 5
- ENTITY AMBIGUITY: when a name could match multiple columns (party vs sales person, delegated_to vs delegate_from), use OR:
  WHERE delegated_to ILIKE '%X%' OR delegate_from ILIKE '%X%'
- ADVANCED AGGREGATES:
  Median: PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY column::numeric)
  95th percentile: PERCENTILE_DISC(0.95) WITHIN GROUP (ORDER BY column::numeric)
  Standard deviation: STDDEV(column::numeric)
  Mode (most common value): subquery with COUNT and ORDER BY DESC LIMIT 1
- LANGUAGE: User may write in Hindi/English/Hinglish — understand all three. But all SQL aliases AND clarify_message AND any natural-language reply MUST be in clean English. The bot ALWAYS replies in English regardless of input language.
- INCLUDE ALL REQUESTED METRICS: if user asks "count + amount", SELECT must have BOTH; never drop a column the user mentioned.

=== HINGLISH UNDERSTANDING (input only — output is always English) ===
- salary/tankhwah/pagaar = sub_group ILIKE '%salary%'
- rent/kiraya = sub_group ILIKE '%rent%'
- ledger/khata/khaata = query_type:"ledger"
- bande/log/employees/karmchari = people/employees
- top X wale = ORDER BY DESC LIMIT X
- kitne/kitni/count/gino = COUNT(*)
- pending/baaki/baaqi = pending table
- image/tasveer/photo/pic = image_link from products
- list/suchi/dikhao/batao = SELECT all with LIMIT
- kharcha/kharche/vyay = expenses table
- bikri/sell = sales table
- total/jama = SUM aggregation
- mahina/month/maheene = GROUP BY month
- party/client/customer = company_name or party_name
- sabse zyada/highest/max = ORDER BY DESC LIMIT 1
- sabse kam/lowest/min = ORDER BY ASC LIMIT 1

=== NOT RELEVANT (CRITICAL — read carefully) ===
query_type:"not_relevant" for ALL of these:
- Casual greetings: hi, hello, thanks, good morning, bye
- Personal questions: how are you, did you eat, kaise ho, khana khaya
- Gossip/casual chat: office mein kya hua, pta hai kya hua, aaj kya plan hai
- Off-topic: weather, jokes, personal life, opinions, feelings
- Non-business: anything NOT about sales/expenses/pending/ledger/products/delegation/checklist/scores/calendar

ONLY classify as DATA_QUERY if user is CLEARLY asking about business data (numbers, reports, specific entries).
"office" alone does NOT make it a business query — "office ki sales" does, "office mein kya hua" does NOT.

=== RESPONSE FORMAT (JSON only, no markdown) ===
{
  "intent": "DATA_QUERY | CALENDAR_BOOKING | CALENDAR_RETRIEVE | CALENDAR_CANCEL | GREETING | IGNORE",
  "query_type": "ledger | data | chart | clarify | not_relevant",
  "ledger_search": "company name",
  "sql": "SELECT ...",
  "chart_config": { "type":"bar|line|pie|doughnut", "title":"...", "sql":"...", "label_col":"...", "value_col":"..." },
  "clarify_message": "...",
  "clarify_options": []
}

=== INTENT RULES ===
- DATA_QUERY: Any question about sales, expenses, pending, ledger, products, delegation, checklist, scores
- CALENDAR_BOOKING: "meeting schedule karo", "appointment book karo", "kal 3 baje meeting rakh do"
- CALENDAR_RETRIEVE: "aaj ki meetings", "is hafte ki schedule", "kiske saath meeting hai"
- CALENDAR_CANCEL: "meeting cancel karo", "appointment hata do"
- GREETING: "hi", "hello", "thanks", "good morning", "kaise ho", "how are you" (set query_type:"not_relevant")
- IGNORE: casual chat, personal questions, gossip, off-topic, non-business conversation (set query_type:"not_relevant")
- For DATA_QUERY: fill sql/ledger_search/chart_config as before
- For CALENDAR_*: set query_type:"clarify" with clarify_message asking for missing info (date/time/person)
- For GREETING/IGNORE: set query_type:"not_relevant"`;
}

// ── CSV GENERATION ────────────────────────────────────────────────────────
function generateCSV(rows, cols) {
  const tmpPath = path.join(os.tmpdir(), `data_${Date.now()}.csv`);
  const header = cols.join(",");
  const body = rows.map(r => cols.map(c => {
    const val = String(r[c] ?? "").replace(/"/g, '""');
    return val.includes(",") || val.includes("\n") ? `"${val}"` : val;
  }).join(",")).join("\n");
  fs.writeFileSync(tmpPath, header + "\n" + body, "utf8");
  return tmpPath;
}

async function generateDataPDF(rows, cols, title) {
  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `data_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 15, size: "A4", layout: "landscape" });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);
      const pageW = doc.page.width;
      const margin = 15;
      const tableW = pageW - margin * 2;
      
      // Smart column limit: if >8 columns, use all (for pivot), else limit to 8
      const displayCols = cols.length > 8 ? cols : cols.slice(0, 8);
      const colW = Math.floor(tableW / displayCols.length);
      const fontSize = displayCols.length > 10 ? 5.5 : 6.5;

      function drawPageHeader() {
        doc.rect(0, 0, pageW, 35).fill("#1a1a2e");
        doc.fillColor("#fff").fontSize(10).font("Helvetica-Bold")
           .text(`Mis Work India — ${title}`, margin, 12, { align: "center", width: tableW });
      }
      function drawColHeaders(y) {
        doc.rect(margin, y, tableW, 14).fill("#333355");
        doc.fillColor("#fff").fontSize(fontSize).font("Helvetica-Bold");
        displayCols.forEach((col, i) => {
          doc.text(col.replace(/_/g," ").substring(0,15), margin + i * colW, y + 3, { width: colW - 2 });
        });
        return y + 14;
      }
      drawPageHeader();
      let y = 40;
      y = drawColHeaders(y);
      doc.fontSize(fontSize).font("Helvetica");
      rows.forEach((r, i) => {
        if (y > doc.page.height - 30) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 20 });
          drawPageHeader();
          y = 45;
          y = drawColHeaders(y);
          doc.fontSize(6.5).font("Helvetica");
        }
        doc.rect(margin, y, tableW, 13).fill(i % 2 === 0 ? "#fff" : "#f5f5f5");
        doc.fillColor("#000");
        displayCols.forEach((col, ci) => {
          let val = r[col];
          let displayVal = "";
          let isLink = false;
          
          // Smart formatting per column type
          const colLower = col.toLowerCase();
          
          if (val == null || val === "") {
            displayVal = "-";
          } else if (colLower.includes("pdf") || colLower.includes("url") || colLower.includes("link") || colLower.includes("image")) {
            // URL columns - show "View PDF" or "View Link" as clickable
            const urlStr = String(val);
            if (urlStr.startsWith("http")) {
              displayVal = colLower.includes("pdf") ? "View PDF" : "View Link";
              isLink = true;
            } else {
              displayVal = urlStr.substring(0, 25);
            }
          } else if (colLower.includes("date") || colLower.includes("created_at") || colLower.includes("updated_at") || colLower === "month") {
            // Date columns - format nicely
            const dateStr = String(val);
            if (dateStr.includes("T")) {
              displayVal = dateStr.split("T")[0]; // Remove time portion
            } else {
              displayVal = dateStr.substring(0, 15);
            }
          } else {
            // Try to detect numeric (amount) columns
            const num = parseFloat(String(val).replace(/[₹,Rs.\s]/g, ""));
            const isAmtCol = /price|amount|salary|total|pending|debit|credit|rent|gst|tax|balance/i.test(col);
            if (!isNaN(num) && num > 0 && isAmtCol && String(val).length < 15) {
              displayVal = num.toLocaleString("en-IN");
            } else {
              displayVal = String(val).substring(0, 30);
            }
          }
          
          if (isLink) {
            doc.fillColor("#0066cc");
            doc.text(displayVal, margin + ci * colW, y + 3, { 
              width: colW - 2,
              link: String(val),
              underline: true
            });
            doc.fillColor("#000");
          } else {
            doc.text(displayVal, margin + ci * colW, y + 3, { width: colW - 2 });
          }
        });
        y += 13;
      });
      doc.fontSize(7).fillColor("#666").text(`Total: ${rows.length} records`, margin, y + 5);
      doc.end();
      stream.on("finish", () => resolve(tmpPath));
      stream.on("error", reject);
    } catch(e) { reject(e); }
  });
}

async function processQuery(
  userMessage, chatHistory, isWhatsApp = false) {
  if (!liveSchema) await fetchLiveSchema();
  const messages = [
    ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];
  const planText = await openai(buildSystemPrompt(isWhatsApp), messages, 1500);
  const match = planText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON from AI");
  const plan = JSON.parse(match[0]);

  // Post-processing guard: relative date queries must be query_type:"data", never "chart"
  if (plan.query_type === "chart" && /last\s+\d+\s+days?|pichle?\s+\d+\s+din|last\s+(week|month|year)|pichle?\s+(hafte?|mahine?|saal)|this\s+(month|week|year)|is\s+(mahine?|hafte?|saal)|yesterday|kal|today|aaj/i.test(userMessage)) {
    console.log("[FIX] Overriding query_type:chart → data for relative date query");
    plan.query_type = "data";
    if (plan.chart_config?.sql) plan.sql = plan.chart_config.sql;
  }

  return plan;
}

async function executePlan({
  message,
  sessionId,
  platform,
  phone = null,
  chatHistory = [],
  userAccess = null
}) {

  console.log("\n========== EXECUTE PLAN ==========");
  console.log("[PLATFORM]", platform);
  console.log("[MESSAGE]", message);

  // STEP 1: Check if there's pending multi-turn state
  const sessionKey = phone || sessionId;
  const pendingState = wpSessions[sessionKey + "_intent"];

  // If user is in a multi-turn flow and sends a follow-up answer
  if (pendingState) {
    // Append context to the message for AI
    const enrichedMessage = `[Previous context: ${pendingState.context}]\nUser reply: ${message}`;
    delete wpSessions[sessionKey + "_intent"];
    saveSession(sessionKey + "_intent");
    const plan = await processQuery(enrichedMessage, chatHistory, platform === "whatsapp");
    console.log("[PLAN] (follow-up)", JSON.stringify(plan, null, 2));
    
    // Apply LIMITED access filter if needed
    if (userAccess && userAccess.mode === "LIMITED" && userAccess.name && plan.sql) {
      plan.sql = applyLimitedAccessFilter(plan.sql, userAccess.name);
    }
    
    return plan;
  }

  // STEP 2: AI PLAN with intent
  const plan = await processQuery(message, chatHistory, platform === "whatsapp");
  console.log("[PLAN]", JSON.stringify(plan, null, 2));

  // STEP 3: Route by intent
  const intent = (plan.intent || "DATA_QUERY").toUpperCase();

  // Safety net: IGNORE/GREETING always returns not_relevant regardless of AI's other fields
  if (intent === "IGNORE" || intent === "GREETING") {
    return { query_type: "not_relevant", intent };
  }

  if (intent.startsWith("CALENDAR")) {
    // Calendar intent — handle booking/retrieve/cancel
    wpSessions[sessionKey + "_intent"] = { intent, context: message, ts: Date.now() };
    saveSession(sessionKey + "_intent");
    return { query_type: "calendar", intent, raw_message: message };
  }

  // Apply LIMITED access filter if needed
  if (userAccess && userAccess.mode === "LIMITED" && userAccess.name && plan.sql) {
    plan.sql = applyLimitedAccessFilter(plan.sql, userAccess.name);
  }

  // DATA_QUERY / GREETING / IGNORE — return plan as-is
  return plan;
}

// ── LIMITED ACCESS FILTER ─────────────────────────────────────────────────
function applyLimitedAccessFilter(sql, userName) {
  const sqlLower = sql.toLowerCase();
  // Escape single quotes to prevent SQL injection
  const safeName = userName.replace(/'/g, "''");
  
  if (sqlLower.includes("from sales")) {
    if (sqlLower.includes("where")) {
      sql = sql.replace(/WHERE/i, `WHERE (sales_person ILIKE '%${safeName}%' OR contact_person ILIKE '%${safeName}%') AND`);
    } else {
      sql = sql.replace(/FROM sales/i, `FROM sales WHERE (sales_person ILIKE '%${safeName}%' OR contact_person ILIKE '%${safeName}%')`);
    }
  }
  
  if (sqlLower.includes("from pending")) {
    if (sqlLower.includes("where")) {
      sql = sql.replace(/WHERE/i, `WHERE sales_person ILIKE '%${safeName}%' AND`);
    } else {
      sql = sql.replace(/FROM pending/i, `FROM pending WHERE sales_person ILIKE '%${safeName}%'`);
    }
  }
  
  if (sqlLower.includes("from delegation_tasks")) {
    if (sqlLower.includes("where")) {
      sql = sql.replace(/WHERE/i, `WHERE (delegated_to ILIKE '%${safeName}%' OR delegate_from ILIKE '%${safeName}%') AND`);
    } else {
      sql = sql.replace(/FROM delegation_tasks/i, `FROM delegation_tasks WHERE (delegated_to ILIKE '%${safeName}%' OR delegate_from ILIKE '%${safeName}%')`);
    }
  }
  
  if (sqlLower.includes("from checklist_tasks")) {
    if (sqlLower.includes("where")) {
      sql = sql.replace(/WHERE/i, `WHERE assigned_to ILIKE '%${safeName}%' AND`);
    } else {
      sql = sql.replace(/FROM checklist_tasks/i, `FROM checklist_tasks WHERE assigned_to ILIKE '%${safeName}%'`);
    }
  }
  
  return sql;
}

// ── FUZZY LEDGER SEARCH ───────────────────────────────────────────────────
async function fuzzyLedgerSearch(searchTerm) {
  const { data: exact } = await supabase.from("ledger")
    .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
    .ilike("name", `%${searchTerm}%`)
    .order("voucher_date", { ascending: true })
    .limit(2000);
  if (exact && exact.length) return exact;

  const words = searchTerm.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const { data: fuzzy } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${word}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (fuzzy && fuzzy.length) return fuzzy;
  }
  
  // Step 3: Partial prefix match (first 4 chars)
  const prefix = searchTerm.replace(/\s+/g,'').substring(0, 4);
  if (prefix.length >= 3) {
    const { data: prefix_data } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${prefix}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (prefix_data && prefix_data.length) return prefix_data;
  }
  // Step 4: First 3 chars fallback
  const prefix3 = searchTerm.replace(/\s+/g, '').substring(0, 3);
  if (prefix3.length >= 3) {
    const { data: p3 } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${prefix3}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (p3 && p3.length) return p3;
  }
  return [];}
  
// ── LEDGER HTML ───────────────────────────────────────────────────────────
function buildLedgerHTML(info, txns) {
  const openBal  = parseFloat(info.opening_balance) || 0;
  const closeBal = parseFloat(info.closing_balance) || 0;
  const dates    = txns.map(r => r.voucher_date).filter(Boolean).sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
  const lastDate  = dates[dates.length - 1] ? fmtDate(dates[dates.length - 1]) : firstDate;
  const TD = `padding:7px 12px;border:1px solid #ddd;font-size:12px;font-family:Arial`;
  const TH = `padding:8px 12px;border:1px solid #444;font-size:12px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff`;

  let rows = `<tr><td style="${TD};white-space:nowrap"><b>01-Apr-25</b></td><td style="${TD}"><b>To</b></td>
    <td style="${TD}" colspan="3"><b>Opening Balance</b></td>
    <td style="${TD};text-align:right"><b>${openBal > 0 ? fmtAmt(openBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${openBal < 0 ? fmtAmt(Math.abs(openBal)) : ""}</b></td></tr>`;

  txns.forEach((r, i) => {
    const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
    rows += `<tr style="background:${i%2===0?"#fff":"#f9f9f9"}">
      <td style="${TD};white-space:nowrap">${fmtDate(r.voucher_date)}</td>
      <td style="${TD}">${isDr?"To":"By"}</td>
      <td style="${TD}">${r.voucher_particular||""}</td>
      <td style="${TD}">${r.voucher_type||""}</td>
      <td style="${TD};font-family:monospace">${r.voucher_no||""}</td>
      <td style="${TD};text-align:right">${isDr?fmtAmt(r.voucher_debit):""}</td>
      <td style="${TD};text-align:right">${!isDr?fmtAmt(r.voucher_credit):""}</td>
    </tr>`;
  });

  const totalDr = txns.reduce((s, r) => s + (parseFloat(r.voucher_debit) || 0), 0);
  const totalCr = txns.reduce((s, r) => s + (parseFloat(r.voucher_credit) || 0), 0);
  const grandDr = totalDr + (openBal > 0 ? openBal : 0);
  const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

  rows += `
    <tr style="background:#f0f0f0"><td style="${TD}" colspan="5"><b>Closing Balance</b></td>
      <td style="${TD};text-align:right"><b>${closeBal>0?fmtAmt(closeBal):""}</b></td>
      <td style="${TD};text-align:right"><b>${closeBal<0?fmtAmt(Math.abs(closeBal)):""}</b></td></tr>
    <tr style="background:#ddd"><td style="${TD}" colspan="5"><b>Grand Total</b></td>
      <td style="${TD};text-align:right"><b>${fmtAmt(grandDr)}</b></td>
      <td style="${TD};text-align:right"><b>${fmtAmt(grandCr)}</b></td></tr>`;

  return `<div style="font-family:Arial;font-size:12px;max-width:960px">
    <div style="text-align:center;padding:12px 4px 6px;border-bottom:2px solid #1a1a2e;margin-bottom:6px">
      <div style="font-size:15px;font-weight:bold;color:#1a1a2e">Mis Work India Private Limited</div>
      <div style="font-size:11px;color:#555;margin-top:3px">7th Floor, Unit No-775, Aggarwal Millenium Tower 2, Netaji Subhash Place, New Delhi - 110034</div>
    </div>
    <div style="text-align:center;padding:6px 4px 8px;border-bottom:1px solid #ccc;margin-bottom:8px">
      <div style="font-size:13px;font-weight:bold">Ledger: ${info.name}</div>
      <div style="font-size:11px;color:#555;margin-top:2px">${firstDate} to ${lastDate}</div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="${TH}">Date</th><th style="${TH}">&nbsp;</th>
          <th style="${TH}">Particulars</th><th style="${TH}">Vch Type</th>
          <th style="${TH}">Vch No.</th>
          <th style="${TH};text-align:right">Debit (Rs.)</th>
          <th style="${TH};text-align:right">Credit (Rs.)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding:6px 8px;font-size:11px;color:#555;display:flex;justify-content:space-between;border-top:1px solid #ddd;margin-top:4px">
      <span>Total Transactions: <b>${txns.length}</b></span>
      <span>Net Balance: <b>${fmtAmt(Math.abs(closeBal))} ${closeBal>=0?"(Dr)":"(Cr)"}</b></span>
    </div>
  </div>`;
}

async function runSQL(sql) {
  if (!/^\s*SELECT\b/i.test(sql)) throw new Error("Only SELECT queries allowed");
  console.log("\n[SQL]", sql);
  // Phase 10: wrap in withRetry — handles ECONNRESET / fetch failed / timeout / 429 etc.
  // SCHEMA / SQL_SYNTAX errors propagate immediately so the outer retry loop can fix them.
  return await selfHeal.withRetry(
    async () => {
      const { data, error } = await supabase.rpc("execute_sql", { query: sql });
      if (error) throw new Error(error.message);
      return data || [];
    },
    { label: 'mis-runSQL', maxAttempts: 3, baseDelayMs: 250 }
  );
}

// ── Phase 8.2: pg_trgm fuzzy fallback for entity columns ──
// When the AI's SQL returns 0 rows AND the WHERE clause has an ILIKE on a known
// entity column (party_name, company_name, sales_person, etc.), suggest similar
// names using PostgreSQL similarity(). Helps recover from typos / partial names.
const MIS_ENTITY_COLS = {
  sales:             ['company_name', 'contact_person'],
  expenses:          ['party_name', 'design_number'],
  pending:           ['party_name', 'sales_person'],
  ledger:            ['name', 'contact_person'],
  products:          ['item_name'],
  delegation_tasks:  ['delegated_to', 'delegate_from'],
  checklist_tasks:   ['assigned_to'],
  scores:            ['employee_name'],
};

async function fuzzyFallbackMis(sql) {
  if (!sql) return null;
  // Extract first FROM table
  const fromMatch = sql.match(/FROM\s+(?:public\.)?(\w+)/i);
  const table = fromMatch ? fromMatch[1].toLowerCase() : null;
  const entityCols = MIS_ENTITY_COLS[table] || [];
  if (!entityCols.length) return null;

  // Find ILIKE filters: column ILIKE '%term%'
  const re = /(\w+)\s+ILIKE\s+'%([^%']+)%'/gi;
  let m;
  const filters = [];
  while ((m = re.exec(sql)) !== null) {
    if (entityCols.includes(m[1].toLowerCase())) {
      filters.push({ col: m[1].toLowerCase(), term: m[2] });
    }
  }
  if (!filters.length) return null;

  // Try each ILIKE filter against pg_trgm similarity
  for (const { col, term } of filters) {
    const safeTerm = String(term).replace(/'/g, "''");
    const sqlFuzzy =
      `SELECT DISTINCT ${col} AS name, ` +
      `similarity(${col}, '${safeTerm}') AS score ` +
      `FROM ${table} ` +
      `WHERE ${col} IS NOT NULL ` +
      `AND similarity(${col}, '${safeTerm}') > 0.15 ` +
      `ORDER BY score DESC LIMIT 5`;
    try {
      const rows = await runSQL(sqlFuzzy);
      const matches = (rows || []).map(r => r.name).filter(Boolean);
      // De-dup keeping order
      const seen = new Set();
      const unique = matches.filter(n => { const k = String(n).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (unique.length) return { searchTerm: term, column: col, table, matches: unique };
    } catch (e) {
      console.error('[MIS FUZZY ERROR]', e.message);
    }
  }
  return null;
}

// ── Phase 8.1: Multi-step AI retry — up to 3 attempts with error feedback ──
// On SQL failure, hand the broken SQL + error message back to the AI inside the
// user message; the AI re-generates a corrected plan using buildSystemPrompt's
// full schema/rule set. Reuses processQuery so all 19+ prompt rules apply on retry.
async function runSQLWithRetry(initialPlan, originalQuery, chatHistory, isWhatsApp) {
  let plan = initialPlan;
  let lastError = null;
  let lastSQL = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!plan?.sql) {
      lastError = lastError || "No SQL generated by AI";
      break;
    }
    try {
      const rows = await runSQL(plan.sql);
      if (attempt > 1) console.log(`[MIS RETRY] succeeded on attempt ${attempt}`);
      return { plan, rows, attempts: attempt };
    } catch (e) {
      lastError = e.message;
      lastSQL = plan.sql;
      const cls = selfHeal.classifyError(e);
      console.error(`[MIS RETRY ${attempt}/3] [${cls.kind}] ${e.message}`);

      // Phase 10.6: terminal errors — don't waste AI retries
      if (cls.kind === 'PERMISSION' || cls.kind === 'SCHEMA_RELATION') {
        return { plan, rows: null, error: e.message, attempts: attempt, errorKind: cls.kind };
      }

      if (attempt >= 3) break;

      // Phase 10.1: SCHEMA_COLUMN error → try cheap Levenshtein column-name fix BEFORE re-prompting AI
      if (cls.kind === 'SCHEMA_COLUMN') {
        const fromMatch = plan.sql.match(/FROM\s+(?:public\.)?(\w+)/i);
        const tableName = fromMatch ? fromMatch[1].toLowerCase() : null;
        const tableCols = tableName ? (liveColumnsByTable[tableName] || []) : [];
        if (tableCols.length) {
          const fix = selfHeal.resolveColumnError(e.message, plan.sql, tableCols);
          if (fix) {
            console.log(`[MIS COL-FIX] '${fix.badCol}' → '${fix.goodCol}' (score=${fix.score.toFixed(2)})`);
            try {
              const rows = await runSQL(fix.rewrittenSQL);
              plan = { ...plan, sql: fix.rewrittenSQL };
              return { plan, rows, attempts: attempt, columnFixed: true };
            } catch (e2) {
              console.error(`[MIS COL-FIX FAILED] ${e2.message}`);
              lastError = e2.message;
              // fall through to AI re-prompt
            }
          }
        }
      }

      // Re-prompt AI with error context — the system prompt already has the schema
      const retryMessage =
        `${originalQuery}\n\n` +
        `[SYSTEM_RETRY_CONTEXT: Your previous SQL had an execution error. ` +
        `Look at the error message carefully and fix the SQL. Common issues: ` +
        `(1) GROUP BY missing for non-aggregated SELECT columns, ` +
        `(2) wrong column name (check schema), ` +
        `(3) ILIKE on numeric column, ` +
        `(4) division by zero — use NULLIF.\n\n` +
        `BROKEN SQL:\n${lastSQL}\n\n` +
        `ERROR: ${lastError}\n\n` +
        `Return JSON with the CORRECTED sql field. Keep the same query_type/intent.]`;

      try {
        plan = await processQuery(retryMessage, chatHistory, isWhatsApp);
      } catch (planErr) {
        console.error(`[MIS RETRY ${attempt}/3] re-plan failed:`, planErr.message);
        lastError = planErr.message;
        break;
      }
    }
  }
  return { plan, rows: null, error: lastError, attempts: 3 };
}

// ── PDF GENERATION ────────────────────────────────────────────────────────
async function generateLedgerPDF(info, txns) {
  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `ledger_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 25, size: "A4", layout: "landscape" });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);

      const openBal  = parseFloat(info.opening_balance) || 0;
      const closeBal = parseFloat(info.closing_balance) || 0;
      const dates    = txns.map(r => r.voucher_date).filter(Boolean).sort();
      const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
      const lastDate  = dates[dates.length-1] ? fmtDate(dates[dates.length-1]) : firstDate;

      const pageW = doc.page.width;
      const margin = 25;
      const tableW = pageW - margin * 2;

      const colWidths = { date:75, type:22, particular:230, vchType:85, vchNo:90, debit:100, credit:100 };
      const colX = {};
      let xPos = margin;
      Object.entries(colWidths).forEach(([key, w]) => { colX[key] = xPos; xPos += w; });

      const ROW_H = 14;
      const HEADER_H = 16;

      function drawPageHeader() {
        doc.rect(0, 0, pageW, 55).fill("#1a1a2e");
        doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
           .text("Mis Work India Private Limited", margin, 10, { align: "center", width: tableW });
        doc.fontSize(7.5).font("Helvetica")
           .text("7th Floor, Unit No-775, Aggarwal Millenium Tower 2, Netaji Subhash Place, New Delhi - 110034", margin, 27, { align: "center", width: tableW });
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff")
           .text(`Ledger: ${info.name}   |   ${firstDate} to ${lastDate}`, margin, 40, { align: "center", width: tableW });
      }

      function drawColumnHeaders(y) {
        doc.rect(margin, y, tableW, HEADER_H).fill("#333355");
        doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
        doc.text("Date",         colX.date,       y+4, { width: colWidths.date });
        doc.text("",             colX.type,       y+4, { width: colWidths.type });
        doc.text("Particulars",  colX.particular, y+4, { width: colWidths.particular });
        doc.text("Vch Type",     colX.vchType,    y+4, { width: colWidths.vchType });
        doc.text("Vch No.",      colX.vchNo,      y+4, { width: colWidths.vchNo });
        doc.text("Debit (Rs.)",  colX.debit,      y+4, { width: colWidths.debit,  align: "right" });
        doc.text("Credit (Rs.)", colX.credit,     y+4, { width: colWidths.credit, align: "right" });
        return y + HEADER_H;
      }

      drawPageHeader();
      let y = 58;
      y = drawColumnHeaders(y);

      // Opening balance
      doc.rect(margin, y, tableW, ROW_H).fill("#f0f4ff");
      doc.fillColor("#000000").fontSize(7).font("Helvetica-Bold");
      doc.text("01-Apr-25",       colX.date,       y+3, { width: colWidths.date });
      doc.text("To",              colX.type,       y+3, { width: colWidths.type });
      doc.text("Opening Balance", colX.particular, y+3, { width: colWidths.particular });
      doc.text("",                colX.vchType,    y+3, { width: colWidths.vchType });
      doc.text("",                colX.vchNo,      y+3, { width: colWidths.vchNo });
      doc.text(openBal > 0 ? fmtAmt(openBal) : "",          colX.debit,  y+3, { width: colWidths.debit,  align: "right" });
      doc.text(openBal < 0 ? fmtAmt(Math.abs(openBal)) : "", colX.credit, y+3, { width: colWidths.credit, align: "right" });
      y += ROW_H;

      doc.fontSize(7).font("Helvetica");
      txns.forEach((r, i) => {
        if (y > doc.page.height - 55) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 25 });
          drawPageHeader();
          y = 58;
          y = drawColumnHeaders(y);
        }
        const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
        doc.rect(margin, y, tableW, ROW_H).fill(i % 2 === 0 ? "#ffffff" : "#f9f9f9");
        doc.fillColor("#000000");
        doc.text(fmtDate(r.voucher_date),   colX.date,       y+3, { width: colWidths.date });
        doc.text(isDr ? "To" : "By",        colX.type,       y+3, { width: colWidths.type });
        doc.text((r.voucher_particular||"").substring(0,45), colX.particular, y+3, { width: colWidths.particular });
        doc.text((r.voucher_type||"").substring(0,18),       colX.vchType,    y+3, { width: colWidths.vchType });
        doc.text((r.voucher_no||"").substring(0,18),         colX.vchNo,      y+3, { width: colWidths.vchNo });
        doc.text(isDr ? fmtAmt(r.voucher_debit) : "",        colX.debit,      y+3, { width: colWidths.debit,  align: "right" });
        doc.text(!isDr ? fmtAmt(r.voucher_credit) : "",      colX.credit,     y+3, { width: colWidths.credit, align: "right" });
        y += ROW_H;
      });

      if (y > doc.page.height - 45) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 25 });
        drawPageHeader();
        y = 58;
        y = drawColumnHeaders(y);
      }

      // Closing balance
      doc.rect(margin, y, tableW, ROW_H).fill("#e8eaf6");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Closing Balance", colX.date, y+3, { width: colWidths.date+colWidths.type+colWidths.particular+colWidths.vchType+colWidths.vchNo });
      doc.text(closeBal > 0 ? fmtAmt(closeBal) : "",          colX.debit,  y+3, { width: colWidths.debit,  align: "right" });
      doc.text(closeBal < 0 ? fmtAmt(Math.abs(closeBal)) : "", colX.credit, y+3, { width: colWidths.credit, align: "right" });
      y += ROW_H;

      const totalDr = txns.reduce((s,r) => s+(parseFloat(r.voucher_debit)||0), 0);
      const totalCr = txns.reduce((s,r) => s+(parseFloat(r.voucher_credit)||0), 0);
      const grandDr = totalDr + (openBal > 0 ? openBal : 0);
      const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

      doc.rect(margin, y, tableW, ROW_H).fill("#c8c8c8");
      doc.text("Grand Total", colX.date, y+3, { width: colWidths.date+colWidths.type+colWidths.particular+colWidths.vchType+colWidths.vchNo });
      doc.text(fmtAmt(grandDr), colX.debit,  y+3, { width: colWidths.debit,  align: "right" });
      doc.text(fmtAmt(grandCr), colX.credit, y+3, { width: colWidths.credit, align: "right" });
      y += ROW_H + 6;

      doc.fontSize(7).font("Helvetica").fillColor("#666666")
         .text(`Total Transactions: ${txns.length}   |   Net Balance: ${fmtAmt(Math.abs(closeBal))} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}`, margin, y);

      doc.end();
      stream.on("finish", () => resolve(tmpPath));
      stream.on("error", reject);
    } catch(e) { reject(e); }
  });
}

// ── CHART ─────────────────────────────────────────────────────────────────
// Single source of truth lives in helpers/chart-builder.js — shared with the
// tenant flow (helpers/tenant-chart.js) so both have identical visuals and
// neither carries the old "JSON.stringify drops arrow-function callbacks" bug.
const { buildChartURL, downloadChartImage } = require("./helpers/chart-builder");

// ── WHATSAPP (Meta Cloud API) ─────────────────────────────────────────────
const { sendWhatsAppReply: _waReply, sendWhatsAppMedia: _waMedia, downloadMetaMedia, formatPhone } = require("./helpers/whatsapp");
async function sendWhatsAppReply(to, message) { return _waReply(supabase, to, message); }
async function sendWhatsAppMedia(to, filePath, caption, mediaType) { return _waMedia(supabase, to, filePath, caption, mediaType); }

// ── TABLE / PIVOT HTML ────────────────────────────────────────────────────
function buildPivotFromSQL(rows) {
  if (!rows.length || !rows[0].hasOwnProperty("month")) return null;
  const nameCol = rows[0].hasOwnProperty("name") ? "name" :
                  rows[0].hasOwnProperty("category") ? "category" :
                  rows[0].hasOwnProperty("design_number") ? "design_number" :
                  rows[0].hasOwnProperty("employee_name") ? "employee_name" : null;
  if (!nameCol) return null;

  const months   = [...new Set(rows.map(r => r.month))].sort();
  const pivot    = {};
  const rowTotals= {};
  const colTotals= {};
  months.forEach(m => colTotals[m] = 0);

  rows.forEach(r => {
    const name = r[nameCol] || "Other";
    const val  = parseFloat(r.total || r.amount || r.total_sales || 0);
    if (!pivot[name]) pivot[name] = {};
    pivot[name][r.month] = (pivot[name][r.month] || 0) + val;
    rowTotals[name] = (rowTotals[name] || 0) + val;
    colTotals[r.month] = (colTotals[r.month] || 0) + val;
  });

  const sortedNames = Object.entries(rowTotals).sort((a,b) => b[1]-a[1]).map(([n]) => n);
  const grandTotal  = Object.values(rowTotals).reduce((s,v) => s+v, 0);
  const TH  = `padding:8px 10px;border:1px solid #444;font-size:11px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;white-space:nowrap;text-align:center`;
  const THL = `padding:8px 10px;border:1px solid #444;font-size:11px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;text-align:left`;
  const TD  = `padding:7px 10px;border:1px solid #ddd;font-size:11px;font-family:Arial;text-align:right;white-space:nowrap`;
  const TDL = `padding:7px 10px;border:1px solid #ddd;font-size:11px;font-family:Arial;text-align:left;white-space:nowrap`;
  const TOT = `padding:7px 10px;border:1px solid #ccc;font-size:11px;font-family:Arial;text-align:right;white-space:nowrap;background:#fff3cd;font-weight:bold`;
  const GRD = `padding:7px 10px;border:1px solid #bbb;font-size:11px;font-family:Arial;text-align:right;white-space:nowrap;background:#e0e0e0;font-weight:bold`;

  let header = `<tr><th style="${THL}">Name</th>`;
  months.forEach(m => { header += `<th style="${TH}">${fmtMonth(m)}</th>`; });
  header += `<th style="${TH};background:#333">Total</th></tr>`;

  let bodyRows = "";
  sortedNames.forEach((name, idx) => {
    let row = `<tr style="background:${idx%2===0?"#fff":"#f9f9f9"}"><td style="${TDL}"><b>${name}</b></td>`;
    months.forEach(m => { const v = pivot[name]?.[m]||0; row += `<td style="${TD}">${v>0?fmtAmt(v):"-"}</td>`; });
    row += `<td style="${TOT}">${fmtAmt(rowTotals[name])}</td></tr>`;
    bodyRows += row;
  });

  let grandRow = `<tr><td style="${GRD};text-align:left">Grand Total</td>`;
  months.forEach(m => { grandRow += `<td style="${GRD}">${colTotals[m]>0?fmtAmt(colTotals[m]):"-"}</td>`; });
  grandRow += `<td style="${GRD};background:#ffc107">${fmtAmt(grandTotal)}</td></tr>`;

  return `<div style="overflow-x:auto;font-family:Arial"><table style="border-collapse:collapse;min-width:700px">
    <thead>${header}</thead><tbody>${bodyRows}${grandRow}</tbody></table>
    <div style="font-size:11px;color:#555;margin-top:8px">Rows: <b>${sortedNames.length}</b> | Grand Total: <b>${fmtAmt(grandTotal)}</b></div></div>`;
}

function buildTableHTML(rows) {
  if (!rows.length) return "<p style='padding:12px;color:#666'>No data found.</p>";
  const cols = Object.keys(rows[0]);
  const TH = `padding:6px 10px;border:1px solid #444;font-size:12px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;text-align:left;white-space:nowrap`;
  const TD = `padding:5px 8px;border:1px solid #ddd;font-size:12px;font-family:Arial;white-space:nowrap`;

  const NON_AMT = /phone|mobile|contact|gst|pan|id|no\.?$|num|number|invoice_no|voucher|ref|bill_ref|email|address|state|city|name|person|login|description|narration|particular|type|group|category|sub_group|design|month|date|period|year/i;
  const allAmtCols = cols.filter(col => {
    if (NON_AMT.test(col)) return false;
    const sampleVals = rows.slice(0,5).map(r => r[col]).filter(v => v !== null && v !== "");
    if (!sampleVals.length) return false;
    return sampleVals.some(v => { const n = parseFloat(String(v).replace(/[₹Rs.\s,]/g,"")); return !isNaN(n) && String(v).replace(/[₹Rs.\s,]/g,"").length < 15; });
  });

  let header = cols.map(c => `<th style="${TH}">${c.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</th>`).join("");
  let bodyRows = "";
  const colSums = {};
  allAmtCols.forEach(c => colSums[c] = 0);

  rows.forEach((r, i) => {
    let row = `<tr style="background:${i%2===0?"#fff":"#f9f9f9"}">`;
    cols.forEach(c => {
      const val = r[c];
      if (allAmtCols.includes(c)) {
        const num = parseFloat(String(val||"").replace(/[₹Rs.\s,]/g,"")) || 0;
        colSums[c] = (colSums[c]||0) + num;
        row += `<td style="${TD};text-align:right">${num>0?fmtAmt(num):"-"}</td>`;
      } else {
        row += `<td style="${TD}">${val===null||val===""||val==="NA"?"-":val}</td>`;
      }
    });
    row += `</tr>`;
    bodyRows += row;
  });

  let totalRow = "";
  if (allAmtCols.length > 0) {
    totalRow = `<tr style="background:#e0e0e0;font-weight:bold">`;
    cols.forEach((c, idx) => {
      if (idx === 0) totalRow += `<td style="${TD};font-weight:bold">Grand Total</td>`;
      else if (allAmtCols.includes(c)) totalRow += `<td style="${TD};text-align:right;font-weight:bold">${fmtAmt(colSums[c])}</td>`;
      else totalRow += `<td style="${TD}"></td>`;
    });
    totalRow += `</tr>`;
  }

  return `<div style="overflow-x:auto;font-family:Arial">
    <table style="border-collapse:collapse;width:100%;min-width:400px">
      <thead><tr>${header}</tr></thead><tbody>${bodyRows}${totalRow}</tbody></table>
    <div style="font-size:11px;color:#555;margin-top:8px">Total Records: <b>${rows.length}</b></div></div>`;
}

// ── WEB CHAT ROUTE ────────────────────────────────────────────────────────
app.get("/history/:sid", async (req, res) => {
  try {
    const { data } = await supabase.from("chat_history").select("role,content,created_at").eq("session_id", req.params.sid).order("created_at", { ascending: true }).limit(50);
    res.json(data || []);
  } catch(e) { res.json([]); }
});
app.delete("/history/:sid", requireAuth, async (req, res) => {
  try { await supabase.from("chat_history").delete().eq("session_id", req.params.sid); } catch(e) {}
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════
// PHASE WEB: Helper to convert tenant-router media → web attachments
// ════════════════════════════════════════════════════════════════════════
//   Input shapes (from tenant-router.js):
//     { type:'document', path:'/tmp/xyz.pdf', caption? }   → PDF/CSV/XLSX
//     { type:'image',    path:'/tmp/chart.png' }           → server-generated image
//     { type:'images',   items:[{url, caption}] }          → remote image URLs
//   Output: array of { type, name?, mime?, base64?, url?, caption? }
//   Frontend renders inline (image) or as download button (document).

// ── Reload persistence (charts only) ─────────────────────────────────────
// Charts are small (~75 KB) and the user expects them to stay visible after a
// browser reload. We copy the generated PNG to public/charts/ so it's served
// as a static file, then store the public URL inline in chat_history via an
// [ATT:...] marker that the frontend parses on history load. PDFs/CSVs are
// NOT persisted — they're heavier and users typically download once.
const CHARTS_DIR = path.join(__dirname, "public", "charts");
try { fs.mkdirSync(CHARTS_DIR, { recursive: true }); } catch (_) {}

// Phase 22 Sprint 1.13 — daily cleanup of chart PNGs older than 30 days.
// Without this the directory grows unboundedly (each WhatsApp/web chart query
// writes a new file). Runs once at boot (60-second warm-up delay) and every
// 24 hours after.
const CHART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
function cleanupOldCharts() {
  fs.readdir(CHARTS_DIR, (err, files) => {
    if (err) return;
    const now = Date.now();
    let deleted = 0, kept = 0;
    files.forEach(f => {
      const p = path.join(CHARTS_DIR, f);
      fs.stat(p, (e, st) => {
        if (e || !st || !st.isFile()) return;
        if (now - st.mtimeMs > CHART_TTL_MS) {
          fs.unlink(p, () => {});
          deleted++;
        } else {
          kept++;
        }
        // Log only if work was done (avoid noisy daily zero-deletion logs).
        if ((deleted + kept) === files.length && deleted > 0) {
          console.log(`[CHARTS-CLEANUP] deleted=${deleted} kept=${kept} (>${Math.round(CHART_TTL_MS / 86400000)}d old)`);
        }
      });
    });
  });
}
setTimeout(cleanupOldCharts, 60 * 1000);
setInterval(cleanupOldCharts, 24 * 60 * 60 * 1000);

function persistChartForReload(media) {
  try {
    if (!media || media.type !== "image" || !media.path) return null;
    if (!fs.existsSync(media.path)) return null;
    const ext = (path.extname(media.path) || ".png").toLowerCase();
    const safe = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const dest = path.join(CHARTS_DIR, safe);
    fs.copyFileSync(media.path, dest);
    return "/charts/" + safe; // public URL (Express static serves /public)
  } catch (e) {
    console.warn("[CHART PERSIST] skipped:", e.message);
    return null;
  }
}

async function mediaToWebAttachments(media) {
  if (!media) return [];
  const fs = require("fs");
  const path = require("path");
  const out = [];

  // Remote image URLs — pass through, no base64
  if (media.type === "images" && Array.isArray(media.items)) {
    for (const it of media.items.slice(0, 20)) {
      if (it && it.url) out.push({ type: "image_url", url: it.url, caption: it.caption || "" });
    }
    return out;
  }

  // Server-generated file (PDF/CSV/PNG) — read + base64-encode for inline delivery
  if (media.path) {
    try {
      if (!fs.existsSync(media.path)) {
        console.warn("[WEB MEDIA] file missing:", media.path);
        return [];
      }
      const stat = fs.statSync(media.path);
      // Cap at 30 MB encoded → ~22 MB raw
      if (stat.size > 22 * 1024 * 1024) {
        console.warn("[WEB MEDIA] file too large:", media.path, stat.size);
        return [];
      }
      const buf = fs.readFileSync(media.path);
      const ext = (path.extname(media.path) || "").toLowerCase().replace(".", "");
      const mimeMap = {
        pdf: "application/pdf",
        csv: "text/csv",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        txt: "text/plain"
      };
      const mime = mimeMap[ext] || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      out.push({
        type: isImage ? "image" : "document",
        name: path.basename(media.path),
        mime,
        base64: buf.toString("base64"),
        caption: media.caption || ""
      });
    } catch (e) {
      console.error("[WEB MEDIA ENCODE ERROR]", e.message);
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
// PHASE WEB-3: Voice transcription endpoint (Whisper)
// Accepts base64-encoded audio in JSON body (avoids multer dependency).
// Frontend records via MediaRecorder → reads as base64 → POSTs here.
// ════════════════════════════════════════════════════════════════════════
app.post("/transcribe", async (req, res) => {
  try {
    const { audio_base64, mime = "audio/webm" } = req.body || {};
    if (!audio_base64 || typeof audio_base64 !== "string") {
      return res.status(400).json({ error: "audio_base64 required" });
    }
    // Cap at ~7 MB encoded → ~5 MB raw audio (~1-2 min voice)
    if (audio_base64.length > 7_500_000) {
      return res.status(413).json({ error: "Audio too large. Max ~1 minute." });
    }
    const buffer = Buffer.from(audio_base64, "base64");
    const ext = mime.includes("webm") ? "webm"
              : mime.includes("ogg")  ? "ogg"
              : mime.includes("mp4")  ? "mp4"
              : mime.includes("wav")  ? "wav"
              : mime.includes("mpeg") ? "mp3"
              : "webm";

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), "audio." + ext);
    form.append("model", "whisper-1");
    // Don't force language — let Whisper auto-detect (works for Hindi/English/Hinglish)

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    let whisperData;
    try {
      const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY },
        body: form,
        signal: ctrl.signal
      });
      whisperData = await r.json();
    } finally { clearTimeout(timer); }

    if (whisperData?.error) {
      console.error("[TRANSCRIBE WHISPER ERROR]", whisperData.error);
      return res.status(500).json({ error: whisperData.error.message || "Whisper failed" });
    }
    const text = (whisperData?.text || "").trim();
    if (!text) return res.status(400).json({ error: "No speech detected in audio. Please try again." });
    console.log("[WEB TRANSCRIBE]", text.slice(0, 80));
    res.json({ text });
  } catch (e) {
    if (e.name === "AbortError") return res.status(504).json({ error: "Transcription timeout" });
    console.error("[TRANSCRIBE ERROR]", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/chat", chatAuthGate, async (req, res) => {
  const message = req.body.message || "";
  const rawSessionId = req.body.session_id || req.body.sessionId || "web";
  // Fix session fixation: prefix web sessions, block phone-number-like session IDs
  const session_id = /^[0-9]{10,15}$/.test(rawSessionId) ? "web_" + rawSessionId : rawSessionId;

  // ── RATE LIMITING (30 msgs/min per IP + 20 msgs/min per session) ───────
  const ip = clientIp(req);
  const ipKey = "web_ip:" + ip;
  const sidKey = "web_sid:" + session_id;
  if (rateLimit(ipKey, 30, 60) || rateLimit(sidKey, 20, 60)) {
    res.set('Retry-After', String(Math.max(rateLimitRetryAfter(ipKey), rateLimitRetryAfter(sidKey))));
    return res.status(429).json({ reply: "⚠️ Too many requests. Please wait a minute.", type: "text" });
  }

  logMessage("web", "incoming", message, { session_id });

  // ── INPUT LENGTH VALIDATION ─────────────────────────────────────────────
  if (message.length > 5000) return res.status(400).json({ reply: "⚠️ Message too long. Max 5000 characters.", type: "text" });

  // Wrap res.json to log outgoing
  const _json = res.json.bind(res);
  res.json = (obj) => { if (obj?.reply) logMessage("web", "outgoing", String(obj.reply).slice(0, 5000), { session_id }); return _json(obj); };

  // Cache check — phone-scoped so different users / DBs don't see stale answers
  const userPhone = (req.body.phone || "").toString().replace(/[^0-9]/g, "");
  const cacheKey = (userPhone || "guest") + "|" + message.toLowerCase().trim();
  const cached = getCached("web:" + cacheKey);
  if (cached) { console.log("[WEB CACHE HIT]", cacheKey); return res.json(cached); }

  // ════════════════════════════════════════════════════════════════════════
  // PHASE WEB-1: TENANT ROUTING (identity-based, same as WhatsApp webhook)
  // Frontend sends `phone` from localStorage. If valid, route through
  // handleTenantQuery — which also handles MIS Main as a virtual tenant for
  // MIS users (returns null in that case → fall through to MIS flow below).
  // ════════════════════════════════════════════════════════════════════════
  if (userPhone && userPhone.length >= 10 && userPhone.length <= 15) {
    try {
      const tenantResult = await handleTenantQuery(supabase, userPhone, message);
      if (tenantResult) {
        if (tenantResult.silent) return res.json({ reply: "", type: "text" });

        // Tenant calendar mode (per-tenant Google Calendar)
        if (tenantResult.calendarMode && tenantResult.tenant) {
          try {
            const calReply = await handleTenantCalendarIntent(message, userPhone, tenantResult.tenant);
            // Persist for reload
            supabase.from("chat_history").insert([
              { session_id, role: "user", content: message },
              { session_id, role: "assistant", content: calReply }
            ]).then(()=>{},()=>{});
            return res.json({ reply: calReply, type: "text" });
          } catch (e) {
            console.error("[WEB TENANT CALENDAR ERROR]", e.message);
            return res.json({ reply: "❌ Calendar error. Please try again.", type: "text" });
          }
        }

        const attachments = await mediaToWebAttachments(tenantResult.media);
        // Persist user msg + assistant reply for reload restore.
        // Charts (PNG images) get copied to public/charts/ and their URL is
        // embedded as an [ATT:{...}] marker so the frontend rebuilds the
        // image on reload. Heavier docs (PDF/CSV) keep the "re-ask" hint
        // since storing their base64 in DB would balloon storage.
        if (tenantResult.reply || attachments.length) {
          const persistedChartUrl = persistChartForReload(tenantResult.media);
          let suffix = "";
          if (persistedChartUrl) {
            const meta = {
              type: "image_url",
              url: persistedChartUrl,
              caption: (tenantResult.media && tenantResult.media.caption) || ""
            };
            suffix = `\n\n[ATT:${JSON.stringify(meta)}]`;
          } else if (attachments.length) {
            suffix = `\n\n_📎 ${attachments.length} attachment(s) — re-ask the question to fetch them again_`;
          }
          const textForHistory = (tenantResult.reply || "") + suffix;
          supabase.from("chat_history").insert([
            { session_id, role: "user", content: message },
            { session_id, role: "assistant", content: textForHistory }
          ]).then(()=>{},()=>{});
        }
        return res.json({
          reply: tenantResult.reply || "",
          type: attachments.length ? "text-with-attachments" : "text",
          attachments
        });
      }
      // null from tenant router → user is MIS-Main user OR no DBs registered.
      // Fall through to existing MIS Main flow below.
    } catch (e) {
      console.error("[WEB TENANT ROUTER ERROR]", e.message);
      // On tenant error, only fall through if user is NOT a registered tenant
      try {
        const { data: tenantCheck } = await supabase.from("tenants").select("id").eq("phone", userPhone).maybeSingle();
        if (tenantCheck) return res.json({ reply: "⚠️ Could not process the query. Please try again.", type: "text" });
        const { data: phoneCheck } = await supabase.from("tenant_phones").select("tenant_id").eq("phone", userPhone).maybeSingle();
        if (phoneCheck) return res.json({ reply: "⚠️ Could not process the query. Please try again.", type: "text" });
      } catch (_) {}
      // else fall through to MIS flow
    }
  }
  // ── END PHASE WEB-1 TENANT ROUTING ──────────────────────────────────────

  // ── CALENDAR STATE: Early-return for multi-turn (confirm/cancel/conflict) ──
  const calState = wpSessions[session_id]?.type;
  if (calState === "calendar_booking_confirm" || calState === "calendar_cancel_reason" || calState === "calendar_conflict") {
    const calReply = await handleCalendarIntent("CALENDAR_BOOKING", message, session_id);
    return res.json({ reply: calReply, type: "text" });
  }
  if (calState === "calendar_booking_pending") {
    const isDataQuery = /sales|expense|pending|ledger|product|kitni|kitne|total|sum|count|list|dikhao|batao/i.test(message);
    if (!isDataQuery && message.length < 100) {
      const calReply = await handleCalendarIntent("CALENDAR_BOOKING", message, session_id);
      return res.json({ reply: calReply, type: "text" });
    }
    delete wpSessions[session_id];
    saveSession(session_id);
  }

  const { data: history } = await supabase
    .from("chat_history")
    .select("role,content")
    .eq("session_id", session_id)
    .order("created_at", { ascending: true })
    .limit(20);
  
  try {

    const plan = await executePlan({
      message,
      sessionId: session_id,
      platform: "web",
      chatHistory: history || []
    });


    if (plan.query_type === "not_relevant") return res.json({ reply: "🙏 That is outside my scope. I can only help with business data — sales, expenses, pending, ledger, products, delegation, or calendar.", type: "text" });

    if (plan.query_type === "calendar") {
      try {
        const calReply = await handleCalendarIntent(plan.intent, plan.raw_message, session_id);
        return res.json({ reply: calReply, type: "text" });
      } catch(e) { return res.json({ reply: "⚠️ Calendar error: " + e.message, type: "text" }); }
    }

    if (plan.query_type === "clarify") {
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:plan.clarify_message }]);
      return res.json({ reply: plan.clarify_message, type: plan.clarify_options?.length ? "suggestions" : "text", options: plan.clarify_options || [] });
    }

    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) return res.json({ reply: "Please tell me the company name.", type: "text" });
      const data = await fuzzyLedgerSearch(search);
      if (!data || !data.length) return res.json({ reply: `No ledger found for "${search}".`, type: "text" });
      const uniqueNames = [...new Set(data.map(r => r.name))];
      if (uniqueNames.length > 1) {
        if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:"Multiple companies found" }]);
        return res.json({ reply: "Multiple companies found. Which one?", type: "suggestions", options: uniqueNames.slice(0,8) });
      }
      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const html = buildLedgerHTML(data[0], txns);
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:html }]);
      return res.json({ reply: html, type: "html" });
    }

    if (plan.query_type === "chart" && plan.chart_config) {
      const cfg = plan.chart_config;
      let rows; try { rows = await runSQL(cfg.sql); } catch(e) { return res.json({ reply: "⚠️ Chart error: " + e.message, type: "text" }); }
      if (!rows || !rows.length) return res.json({ reply: "No data for chart.", type: "text" });
      const reply = buildTableHTML(rows);
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:reply }]);
      const result = { reply, type: "html", chartMeta: { chartType: cfg.type, title: cfg.title, labelCol: cfg.label_col, valueCol: cfg.value_col } };
      setCache("web:" + cacheKey, result);
      return res.json(result);
    }

    if (!plan.sql) return res.json({ reply: "⚠️ I couldn't understand that query. Could you give a bit more detail?", type: "text" });
    
    let rows; try { rows = await runSQL(plan.sql); } catch(e) { return res.json({ reply: `⚠️ Query failed: ${e.message.substring(0,80)}`, type: "text" }); }

    if (!rows || !rows.length) {
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:"No data found" }]);
      return res.json({ reply: `No data found for: "${message}"`, type: "suggestions", options: ["Show all sales","Show all expenses","Show pending payments"] });
    }

    const reply = buildPivotFromSQL(rows) || buildTableHTML(rows);
    if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:reply }]);
    const result = { reply, type: "html" };
    setCache("web:" + cacheKey, result);
    return res.json(result);

  } catch(err) {
    console.error("[CHAT ERROR]", err);
    res.json({ reply: "⚠️ Something went wrong. Please try again.", type: "text" });
  }
});

// ── CALENDAR INTENT HANDLER ───────────────────────────────────────────────
async function handleCalendarIntent(intent, message, phone = null) {
  // Check for multi-turn conversation state
  const sessionKey = phone || "default";
  const session = wpSessions[sessionKey] || {};
  
  // Handle follow-up responses for conflicts
  if (session.type === "calendar_conflict") {
    if (/book kar do|proceed|ignore|continue/i.test(message)) {
      const event = await gcal.createEvent(session.pendingBooking);
      const start = new Date(session.pendingBooking.startTime);
      const time = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const date = start.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" });
      
      // Clear session
      delete wpSessions[sessionKey];
      if (phone) saveSession(phone);
      
      // Send notifications (async, don't block response)
      sendBookingNotifications(event, session.pendingBooking, phone).catch(e => console.error("[NOTIF ERROR]", e.message));
      
      return `✅ *Meeting booked despite conflict!*\n\n📌 ${event.summary}\n📅 ${date}\n⏰ ${time}\n🔗 ${event.htmlLink}`;
    } else if (/time change|different time|reschedule/i.test(message)) {
      // Clear session and ask for new time
      delete wpSessions[sessionKey];
      if (phone) saveSession(phone);
      return `📅 *Please give a new time:*\n\nExample: "Make it 2 PM" or "Change to 4:30 PM"\n\nOriginal meeting: ${session.pendingBooking.title}`;
    } else if (/cancel|mat karo|nahi/i.test(message)) {
      delete wpSessions[sessionKey];
      if (phone) saveSession(phone);
      return `❌ *Booking cancelled.*\n\nWould you like to book a different meeting?`;
    }
  }
  
  // Handle follow-up for cancellation reasons
  if (session.type === "calendar_cancel_reason") {
    // Step 1: If awaiting selection (sab/specific/cancel)
    if (session.awaitingSelection) {
      if (/cancel mat|nahi|no|stop/i.test(message)) {
        delete wpSessions[sessionKey];
        if (phone) saveSession(phone);
        return `✅ Cancellation aborted. Your meetings are safe.`;
      }
      // Select specific meeting by number
      const numMatch = message.match(/(\d+)/);
      let toCancel;
      if (/sab|all|saari|yes|haan|ha|confirm/i.test(message)) {
        toCancel = session.eventsToCancel;
      } else if (numMatch) {
        const idx = parseInt(numMatch[1]) - 1;
        if (idx >= 0 && idx < session.eventsToCancel.length) toCancel = [session.eventsToCancel[idx]];
        else return `❌ Invalid number. Please pick between 1 and ${session.eventsToCancel.length}.`;
      } else {
        toCancel = session.eventsToCancel;
      }
      // Move to reason step
      wpSessions[sessionKey] = { type: "calendar_cancel_reason", eventsToCancel: toCancel };
      if (phone) saveSession(phone);
      return `📅 *Tell me the cancellation reason:*\n\n1️⃣ Client unavailable\n2️⃣ Holiday/Personal\n3️⃣ Schedule conflict\n4️⃣ Meeting postponed\n5️⃣ Other`;
    }

    // Step 2: Process reason and delete
    let reason = "Other";
    if (/client|unavailable/i.test(message)) reason = "Client unavailable";
    else if (/holiday|personal|chutti/i.test(message)) reason = "Holiday/Personal";
    else if (/conflict|clash|schedule/i.test(message)) reason = "Schedule conflict";
    else if (/postpone|reschedule|baad/i.test(message)) reason = "Meeting postponed";
    else if (/emergency|urgent/i.test(message)) reason = "Emergency";
    else if (/1/i.test(message)) reason = "Client unavailable";
    else if (/2/i.test(message)) reason = "Holiday/Personal";
    else if (/3/i.test(message)) reason = "Schedule conflict";
    else if (/4/i.test(message)) reason = "Meeting postponed";
    else if (/5/i.test(message)) reason = "Other";
    
    // Process the cancellation with reason
    const eventsToCancel = session.eventsToCancel;
    for (const e of eventsToCancel) {
      const cancelNote = `\n\n[CANCELLED: ${new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} - Reason: ${reason}]`;
      try {
        await gcal.updateEvent(e.id, { 
          description: (e.description || "") + cancelNote,
          summary: "[CANCELLED] " + e.summary 
        });
        await supabase.from("calendar_logs").insert({
          event_id: e.id,
          action: "cancelled",
          reason: reason,
          event_title: e.summary,
          event_date: e.start.dateTime || e.start.date,
          cancelled_at: new Date().toISOString()
        });
      } catch(err) {
        console.error("Error logging cancellation:", err);
      }
      await gcal.deleteEvent(e.id);
    }
    
    // Clear session
    delete wpSessions[sessionKey];
    if (phone) saveSession(phone);
    
    // Send cancellation notifications
    sendCancellationNotifications(eventsToCancel, reason, phone).catch(e => console.error("[NOTIF ERROR]", e.message));
    
    return `✅ *${eventsToCancel.length} meeting(s) cancelled!*\n\n${eventsToCancel.map(e => `❌ ${e.summary}`).join("\n")}\n\n📝 Reason: ${reason}`;
  }
  
  // Handle follow-up for booking confirmation
  if (session.type === "calendar_booking_confirm") {
    if (/yes|haan|confirm|book|kar do|ok/i.test(message)) {
      const parsed = session.pendingBooking;
      
      // Check for conflicts one more time
      const startTime = new Date(parsed.startTime);
      const endTime = parsed.endTime ? new Date(parsed.endTime) : new Date(startTime.getTime() + 3600000);
      const conflictStart = new Date(startTime.getTime() - 2 * 3600000).toISOString();
      const conflictEnd = new Date(endTime.getTime() + 2 * 3600000).toISOString();
      const existingEvents = await gcal.getEvents(conflictStart, conflictEnd);
      const conflicts = existingEvents.filter(e => {
        const eStart = new Date(e.start.dateTime || e.start.date);
        const eEnd = new Date(e.end.dateTime || e.end.date);
        return (startTime < eEnd && endTime > eStart);
      });
      
      if (conflicts.length > 0) {
        // Handle conflict
        wpSessions[sessionKey] = {
          type: "calendar_conflict",
          pendingBooking: parsed,
          conflicts: conflicts
        };
        if (phone) saveSession(phone);
        
        const conflictList = conflicts.map(e => {
          const s = new Date(e.start.dateTime || e.start.date);
          const time = s.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
          return `⚠️ ${time} — ${e.summary}`;
        }).join("\n");
        
        return `⚠️ *CONFLICT DETECTED!*\n\n🔴 *Existing meetings:*\n${conflictList}\n\n❓ *Still want to book?*\n• "Book anyway" — proceed\n• "Change time" — pick a different time\n• "Cancel" — abort booking`;
      }
      
      // No conflicts, proceed with booking
      const event = await gcal.createEvent(parsed);
      const start = new Date(parsed.startTime);
      const time = start.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const date = start.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" });
      
      // Clear session
      delete wpSessions[sessionKey];
      if (phone) saveSession(phone);
      
      // Send notifications
      sendBookingNotifications(event, parsed, phone).catch(e => console.error("[NOTIF ERROR]", e.message));
      
      return `✅ *Meeting booked successfully!*\n\n📌 ${event.summary}\n📅 ${date}\n⏰ ${time}\n${event.meetLink ? `🔗 Meet: ${event.meetLink}\n` : ""}📎 ${event.htmlLink}`;
    } else if (/no|nahi|cancel|mat karo/i.test(message)) {
      delete wpSessions[sessionKey];
      if (phone) saveSession(phone);
      return `❌ *Booking cancelled.*\n\nMake any changes you need and try again.`;
    } else {
      return `❓ *Please confirm:*\n• "Yes" — book it\n• "No" — cancel`;
    }
  }
  if (intent === "CALENDAR_RETRIEVE") {
    // Parse what range user wants
    const now = new Date();
    let start, end, label;
    if (/kal|tomorrow/i.test(message)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      end = new Date(start.getTime() + 86400000);
      label = "Tomorrow";
    } else if (/week|hafte|hafta/i.test(message)) {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 7 * 86400000);
      label = "This week";
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start.getTime() + 86400000);
      label = "Today";
    }
    const events = await gcal.getEvents(start.toISOString(), end.toISOString());
    if (!events.length) return `📅 ${label}: no meetings scheduled.`;
    
    const lines = events.map((e, i) => {
      const s = new Date(e.start.dateTime || e.start.date);
      const endTime = new Date(e.end.dateTime || e.end.date);
      const time = s.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      const day = s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
      
      // Add Live/Soon badges
      let badge = "";
      const currentTime = now.getTime();
      const meetingStart = s.getTime();
      const meetingEnd = endTime.getTime();
      
      if (currentTime >= meetingStart && currentTime <= meetingEnd) {
        badge = "🟢 LIVE ";
      } else if (meetingStart - currentTime <= 15 * 60 * 1000 && meetingStart > currentTime) {
        badge = "🔔 SOON ";
      }
      
      return `${i + 1}. ${badge}${time} (${day}) — ${e.summary}`;
    });
    return `📅 *${label} ki meetings (${events.length}):*\n\n${lines.join("\n")}`;
  }

  if (intent === "CALENDAR_BOOKING") {
    // If we have pending context, combine with new message
    let fullMessage = message;
    if (session.type === "calendar_booking_pending" && session.context) {
      fullMessage = session.context + ". " + message;
    }
    
    const parsed = await parseCalendarBooking(fullMessage);
    
    // If AI says info is missing, ask user and save state
    if (parsed.missing) {
      wpSessions[sessionKey] = { type: "calendar_booking_pending", context: fullMessage };
      if (phone) saveSession(phone);
      return `📅 To book the meeting, please tell me:\n${parsed.missing}`;
    }

    // Recurring meeting
    if (parsed.recurring && parsed.recurring !== "none") {
      const events = [];
      let startDate = new Date(parsed.startTime);
      const endDate = parsed.endTime ? new Date(parsed.endTime) : new Date(startDate.getTime() + 3600000);
      const duration = endDate.getTime() - startDate.getTime();
      
      // Fix day-of-week if specified (e.g., "har friday" but AI gave wrong day)
      if (parsed.day) {
        const dayMap = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
        const targetDay = dayMap[parsed.day.toLowerCase()];
        if (targetDay !== undefined && startDate.getDay() !== targetDay) {
          const currentDay = startDate.getDay();
          let diff = targetDay - currentDay;
          if (diff <= 0) diff += 7;
          startDate = new Date(startDate.getTime() + diff * 86400000);
        }
      }

      let intervalDays = 7; // weekly default
      if (parsed.recurring === "daily") intervalDays = 1;
      if (parsed.recurring === "monthly") intervalDays = 30;
      if (parsed.recurring === "biweekly") intervalDays = 14;
      
      // Smart count: "5 months weekly" = ~20, "3 weeks" = 3, "5 months monthly" = 5
      let count = parsed.count || 4;
      if (parsed.countUnit === "months" || parsed.countUnit === "month") {
        if (parsed.recurring === "weekly") count = parsed.count * 4;
        else if (parsed.recurring === "daily") count = parsed.count * 30;
        else count = parsed.count; // monthly = count stays
      }
      
      // Generate meet link for the series
      const meetLink = `https://meet.jit.si/MIS-${(parsed.title || "meeting").replace(/[^a-zA-Z0-9]/g, "").substring(0, 20)}-${Math.random().toString(36).substring(2, 8)}`;

      for (let i = 0; i < count; i++) {
        const s = new Date(startDate.getTime() + i * intervalDays * 86400000);
        const e = new Date(s.getTime() + duration);
        const event = await gcal.createEvent({
          title: parsed.title,
          startTime: s.toISOString(),
          endTime: e.toISOString(),
          description: `Recurring: ${parsed.recurring} (${i + 1}/${count})\n🔗 Meet: ${meetLink}`,
          addMeetLink: false
        });
        events.push(s);
      }
      
      const dates = events.map(d => d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }));
      const time = startDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
      
      // Log recurring booking + send email
      logBooking({ id: null, summary: parsed.title }, parsed, "booked_recurring").catch(e => console.error("[LOG ERROR]", e.message));
      sendBookingNotifications({ summary: parsed.title, meetLink, htmlLink: "" }, parsed, phone).catch(e => console.error("[NOTIF ERROR]", e.message));
      
      return `✅ *${count} meetings booked! (${parsed.recurring})*\n\n📌 ${parsed.title}\n⏰ ${time}\n📅 Dates:\n${dates.map((d, i) => `   ${i + 1}. ${d}`).join("\n")}\n\n🔗 Meet: ${meetLink}`;
    }

    // Single event
    if (!parsed.title || !parsed.startTime) {
      return "📅 To book a meeting, please tell me:\n• Who is it with? (name)\n• When? (date + time)\n• What is the topic?";
    }
    
    // Past date validation
    if (new Date(parsed.startTime) < new Date()) {
      return "⚠️ Cannot book a meeting in the past. Please pick a future date.";
    }
    
    // Show pre-booking summary for confirmation
    const startTime = new Date(parsed.startTime);
    const endTime = parsed.endTime ? new Date(parsed.endTime) : new Date(startTime.getTime() + 3600000);
    const time = startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const endTimeStr = endTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const date = startTime.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", weekday: "short" });
    
    // Store in session for confirmation
    wpSessions[sessionKey] = {
      type: "calendar_booking_confirm",
      pendingBooking: parsed
    };
    if (phone) saveSession(phone);
    
    return `📅 *Meeting Summary — please confirm:*\n\n📌 **Title:** ${parsed.title}\n📅 **Date:** ${date}\n⏰ **Time:** ${time} - ${endTimeStr}\n${parsed.description ? `📝 **Description:** ${parsed.description}\n` : ""}${parsed.guests && parsed.guests.length ? `👥 **Guests:** ${parsed.guests.join(", ")}\n` : ""}\n❓ **Confirm booking?**\n• "Yes" — book it\n• "No" — cancel`;
  }

  if (intent === "CALENDAR_CANCEL") {
    // Find matching events to cancel
    const parsed = await parseCancelRequest(message);
    const now = new Date();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 30 * 86400000).toISOString(); // next 30 days
    const events = await gcal.getEvents(start, end);
    
    if (!events.length) return "📅 No upcoming meetings to cancel.";
    
    // Find matching events by name
    const searchTerm = (parsed.searchTerm || "").toLowerCase();
    const matching = searchTerm 
      ? events.filter(e => (e.summary || "").toLowerCase().includes(searchTerm))
      : events;
    
    if (!matching.length) return `📅 No meetings found matching "${parsed.searchTerm}".\n\nUpcoming:\n${events.slice(0, 5).map((e, i) => `${i + 1}. ${e.summary}`).join("\n")}`;
    
    // If multiple matching (recurring series), ask user
    if (matching.length > 1 && !parsed.cancelAll) {
      const lines = matching.slice(0, 10).map((e, i) => {
        const s = new Date(e.start.dateTime || e.start.date);
        return `${i + 1}. ${s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} — ${e.summary}`;
      });
      // Store in session for follow-up
      wpSessions[sessionKey] = { type: "calendar_cancel_reason", eventsToCancel: matching, awaitingSelection: true };
      if (phone) saveSession(phone);
      return `📅 *Found ${matching.length} meetings matching "${parsed.searchTerm}":*\n\n${lines.join("\n")}\n\n❓ *What would you like to do?*\n• "Cancel all" — cancel all of them\n• "Cancel [number]" — cancel a specific one\n• "Don't cancel" — abort`;
    }
    
    // Ask for cancellation reason if not provided
    if (!parsed.reason && !parsed.skipReason) {
      // Store events to cancel in session
      const toCancel = parsed.cancelAll ? matching : (parsed.index && parsed.index <= matching.length) ? [matching[parsed.index - 1]] : [matching[0]];
      wpSessions[sessionKey] = {
        type: "calendar_cancel_reason",
        eventsToCancel: toCancel
      };
      if (phone) saveSession(phone);
      
      return `📅 *Tell me the cancellation reason:*\n\n1️⃣ Client unavailable\n2️⃣ Holiday/Personal\n3️⃣ Schedule conflict\n4️⃣ Meeting postponed\n5️⃣ Other\n\nExample: "Client unavailable" or "Holiday"`;
    }
    
    // Cancel all matching or single
    if (parsed.cancelAll || matching.length === 1) {
      const toCancel = parsed.cancelAll ? matching : [matching[0]];
      const reason = parsed.reason || "No reason provided";
      
      for (const e of toCancel) {
        // Update event description to include cancellation reason before deleting
        const cancelNote = `\n\n[CANCELLED: ${new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} - Reason: ${reason}]`;
        try {
          await gcal.updateEvent(e.id, { 
            description: (e.description || "") + cancelNote,
            summary: "[CANCELLED] " + e.summary 
          });
          // Log cancellation to database
          await supabase.from("calendar_logs").insert({
            event_id: e.id,
            action: "cancelled",
            reason: reason,
            event_title: e.summary,
            event_date: e.start.dateTime || e.start.date,
            cancelled_at: new Date().toISOString()
          });
        } catch(err) {
          console.error("Error logging cancellation:", err);
        }
        await gcal.deleteEvent(e.id);
      }
      
      // Send cancellation notifications
      sendCancellationNotifications(toCancel, reason, phone).catch(e => console.error("[NOTIF ERROR]", e.message));
      
      return `✅ *${toCancel.length} meeting(s) cancelled!*\n\n${toCancel.map(e => `❌ ${e.summary}`).join("\n")}\n\n📝 Reason: ${reason}`;
    }
    
    // Cancel specific by index
    if (parsed.index && parsed.index <= matching.length) {
      const e = matching[parsed.index - 1];
      const reason = parsed.reason || "No reason provided";
      
      // Log cancellation
      const cancelNote = `\n\n[CANCELLED: ${new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"})} - Reason: ${reason}]`;
      try {
        await gcal.updateEvent(e.id, { 
          description: (e.description || "") + cancelNote,
          summary: "[CANCELLED] " + e.summary 
        });
        await supabase.from("calendar_logs").insert({
          event_id: e.id,
          action: "cancelled",
          reason: reason,
          event_title: e.summary,
          event_date: e.start.dateTime || e.start.date,
          cancelled_at: new Date().toISOString()
        });
      } catch(err) {
        console.error("Error logging cancellation:", err);
      }
      
      await gcal.deleteEvent(e.id);
      const s = new Date(e.start.dateTime || e.start.date);
      
      sendCancellationNotifications([e], reason, phone).catch(err => console.error("[NOTIF ERROR]", err.message));
      
      return `✅ *Meeting cancelled!*\n\n❌ ${e.summary}\n📅 ${s.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}\n📝 Reason: ${reason}`;
    }
    
    return "📅 Kaunsi meeting cancel karni hai? Name ya date batao.";
  }

  return "📅 Calendar ready! Try:\n• \"Today's meetings\" — view your schedule\n• \"Book a meeting with [name] on [date] at [time]\" — booking\n• \"Cancel meeting with [name]\" — cancel";
}

// Parse booking details from natural language using AI
async function parseCalendarBooking(message) {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const dayName = now.toLocaleDateString("en-IN", { weekday: "long" });
  
  const prompt = `Extract meeting details from this message (input may be in Hindi, English, or Hinglish — understand all three but produce English output).
Today: ${todayStr} (${dayName}), Current time: ${now.toLocaleTimeString("en-IN", {hour12: false})}, Timezone: Asia/Kolkata

Return JSON ONLY:
{
  "title": "Meeting with [person/topic]",
  "startTime": "ISO 8601 datetime with +05:30 offset",
  "endTime": "ISO 8601 or null (default +1hr)",
  "recurring": "none | daily | weekly | biweekly | monthly",
  "count": number (the raw number user said, e.g. "5 months" = 5, "3 weeks" = 3),
  "countUnit": "weeks | months | times" (what unit the count is in),
  "day": "monday/tuesday/etc if specified",
  "missing": null or "string explaining what info is needed (in English)"
}

CRITICAL RULES:
- "1 bje" / "1 baje" = 1:00 PM (13:00), NOT 1:00 AM
- "3 bje" = 3:00 PM (15:00), "11 bje" = 11:00 AM
- Any time 1-8 without AM/PM = PM. 9-11 = AM. 12 = PM.
- "next 3 weeks" / "3 hafte" = recurring:"weekly", count:3
- "2 months" / "2 mahine" = recurring:"weekly", count:8 (or recurring:"monthly", count:2 based on context)
- "har week" / "every week" / "weekly" = recurring:"weekly"
- "har din" / "daily" / "roz" = recurring:"daily"
- "every friday" / "har friday" = recurring:"weekly", day:"friday", startTime = next Friday at specified time
- "every monday" / "har monday" = recurring:"weekly", day:"monday", startTime = next Monday at specified time
- If recurring AND specific day mentioned (monday/tuesday/wednesday/thursday/friday/saturday/sunday), calculate startTime as next occurrence of that day
- If recurring but NO specific day given, set missing:"Which day should the meeting be on? (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)" and return null for startTime
- Only set startTime when a specific day/date is mentioned by user (e.g. "monday", "wednesday", "kal", "22 may", "every friday")
- If no person/topic/name mentioned, set missing:"Who is the meeting with? (name or topic)"
- If no time mentioned, set missing:"What time? (e.g. 1 PM, 3 PM, 11 AM)"
- If multiple things missing, combine all in one missing string
- If no date/day context at all, set missing:"When? Please provide a date or day."
- "kal" = tomorrow (${new Date(now.getTime() + 86400000).toISOString().split("T")[0]})
- "parso" = day after tomorrow
- For recurring weekly with specific day: calculate next occurrence of that weekday and set as startTime

Message: "${message}"`;

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0 })
  });
  const data = await resp.json();
  try {
    const text = data.choices[0].message.content.replace(/```json?|```/g, "").trim();
    return JSON.parse(text);
  } catch(e) { return {}; }
}

// Parse cancel request
async function parseCancelRequest(message) {
  const prompt = `Extract cancel details from: "${message}"
Return JSON: {
  "searchTerm":"name/topic to search",
  "cancelAll":true/false,
  "index":null or number,
  "reason":"cancellation reason if mentioned",
  "skipReason":true/false
}

Reason extraction rules:
- "client unavailable" / "client nahi aa sakta" = "Client unavailable"
- "holiday" / "chutti" / "personal" = "Holiday/Personal"
- "conflict" / "clash" / "time change" = "Schedule conflict"  
- "postpone" / "reschedule" / "baad mein" = "Meeting postponed"
- "emergency" / "urgent" = "Emergency"
- If no reason mentioned, set reason:null
- If user says "bas cancel karo" / "reason nahi batana", set skipReason:true

Examples:
- "sab cancel" / "saari" = cancelAll:true
- "sirf 2 cancel" = index:2
- "archit meeting cancel karo client unavailable hai" = searchTerm:"archit", reason:"Client unavailable"
- Otherwise extract the meeting name/person to search`;
  
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], temperature: 0 })
  });
  const data = await resp.json();
  try {
    return JSON.parse(data.choices[0].message.content.replace(/```json?|```/g, "").trim());
  } catch(e) { 
    return { 
      searchTerm: message.replace(/cancel|hata|delete|remove|karo|do/gi, "").trim(),
      reason: null,
      skipReason: false
    }; 
  }
}

// ── WHATSAPP WEBHOOK ──────────────────────────────────────────────────────
// Test endpoint - manually trigger webhook to test full flow
app.get("/test-webhook", async (req, res) => {
  const testPayload = { message: "total sales kitni hai", senderNumber: "918750285420", itemType: "text", boundType: "in" };
  console.log("\n🧪 TEST WEBHOOK TRIGGERED");
  try {
    const r = await fetch("http://localhost:3000/whatsapp", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(testPayload) });
    const d = await r.json();
    res.json({ test: "triggered", result: d });
  } catch(e) { res.json({ error: e.message }); }
});

app.get("/whatsapp", (req, res) => {
  console.log("[WEBHOOK VERIFY] query:", JSON.stringify(req.query));
  const mode = req.query["hub.mode"], challenge = req.query["hub.challenge"];
  if (mode === "subscribe") return res.status(200).send(challenge || "OK");
  res.status(200).send("OK");
});

app.post("/whatsapp", async (req, res) => {
  console.log("\n🔥 WHATSAPP WEBHOOK HIT |", new Date().toLocaleString("en-IN", {timeZone: "Asia/Kolkata"}));
  console.log("[PAYLOAD]", JSON.stringify(req.body));
  console.log("========================================");
  try {
    const body = req.body;

    // ── WEBHOOK AUTH (Phase 22 Sprint 1.5) ────────────────────────────────
    // Multiple verification strategies, evaluated in order:
    //   1. Meta-style HMAC-SHA256 in X-Hub-Signature-256 header
    //   2. Simple shared-secret in x-webhook-secret header (wa.apimis.in
    //      style — current production setup)
    // If WEBHOOK_STRICT=true is set in .env, missing/invalid signatures
    // result in 401. Otherwise we log a warning but accept (current
    // production behavior — won't break wa.apimis.in if it stops sending
    // the header during a transient issue).
    const _strict = process.env.WEBHOOK_STRICT === 'true';
    const _secret = process.env.WEBHOOK_SECRET;
    const _hubSig = req.headers['x-hub-signature-256'] || '';
    const _shared = req.headers['x-webhook-secret'] || '';

    let _verified = false, _why = 'no-auth';

    if (_secret && _hubSig && _hubSig.startsWith('sha256=') && req.rawBody) {
      try {
        const crypto = require('crypto');
        const expected = 'sha256=' + crypto.createHmac('sha256', _secret).update(req.rawBody).digest('hex');
        const a = Buffer.from(_hubSig);
        const b = Buffer.from(expected);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          _verified = true; _why = 'hmac-ok';
        } else {
          _why = 'hmac-mismatch';
        }
      } catch (e) { _why = 'hmac-error:' + e.message; }
    } else if (_secret && _shared) {
      try {
        const crypto = require('crypto');
        const a = Buffer.from(_shared);
        const b = Buffer.from(_secret);
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          _verified = true; _why = 'shared-ok';
        } else {
          _why = 'shared-mismatch';
        }
      } catch (e) { _why = 'shared-error:' + e.message; }
    }

    if (!_verified) {
      console.warn(`[WEBHOOK AUTH] ${_why} — strict=${_strict}`);
      if (_strict) return res.status(401).json({ error: 'Unauthorized webhook' });
    }

    // ── PARSE WEBHOOK (wa.apimis.in format) ───────────────────────────────
    if (body.boundType === "out") return res.status(200).json({ success: true, ignored: true });

    // Extract sender and message from wa.apimis.in payload
    const actualPhone = body.senderNumber || body.from || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || "";
    if (!actualPhone) return res.status(200).json({ success: true, ignored: true });

    // Respond immediately
    res.status(200).json({ success: true });
    res.json = () => res;

    // ── RATE LIMITING (20 msgs/min per phone) ─────────────────────────────
    if (rateLimit("wp:" + actualPhone, 20, 60)) {
      console.log("[RATE LIMITED]", actualPhone);
      return;
    }

    // ── AUDIO/VOICE MESSAGE HANDLING ──────────────────────────────────────
    let isAudio = false;
    let textMessage = "";
    const itemType = body.itemType || body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type || "";

    if (itemType === "ptt" || itemType === "audio") {
      const audioUrl = body.filePath;
      const mediaId = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.audio?.id;
      if (!audioUrl && !mediaId) { console.log("⚠️ Audio but no source"); return; }
      console.log("[AUDIO] FROM:", actualPhone);

      let audioBuffer;
      try {
        if (audioUrl) audioBuffer = Buffer.from(await (await fetch(audioUrl)).arrayBuffer());
        else audioBuffer = await downloadMetaMedia(mediaId);
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ Could not download the audio."); return; }

      let transcript;
      try {
        const form = new FormData();
        form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "audio.ogg");
        form.append("model", "whisper-1");
        form.append("language", "hi");
        const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY },
          body: form
        });
        const whisperData = await whisperRes.json();
        transcript = whisperData.text || "";
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ Could not understand the audio. Please send as text."); return; }

      if (!transcript.trim()) { await sendWhatsAppReply(actualPhone, "⚠️ No speech detected in the audio. Please try again."); return; }
      console.log("[TRANSCRIPT]", transcript);
      textMessage = transcript;
      isAudio = true;
    } else {
      textMessage = body.message || body.value || body.text || body.Body ||
        body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || "";
    }

    if (!textMessage) {
      console.log("⚠️ No message body");
      return;
    }

    const query = textMessage.trim().replace(/^mis[\s-]?bot\s*/i,"").trim();
    console.log("[WP QUERY]", isAudio ? "🎤 " + query : query, "| FROM:", actualPhone);
    logMessage("whatsapp", "incoming", query, { phone: actualPhone, message_type: isAudio ? "audio" : "text" });

    // ── ACCESS CONTROL CHECK ──────────────────────────────────────────────
    // Phase 9.1: registered tenants bypass the MIS access list.
    // Without this, any tenant whose phone is NOT in access_control.json
    // would be blocked here BEFORE handleTenantQuery has a chance to route them
    // — making voice (and text) effectively broken for non-MIS tenants.
    const access = checkAccess(actualPhone);
    let isTenant = false;
    if (!access.allowed) {
      isTenant = await isKnownTenant(actualPhone);
      if (!isTenant) {
        await sendWhatsAppReply(actualPhone, "⛔ You do not have access to this bot. Please contact admin.");
        return;
      }
      // Known tenant — let them through with a synthetic 'TENANT' access mode.
      access.allowed = true;
      access.access  = 'TENANT';
    }

    // ── ADMIN COMMANDS ────────────────────────────────────────────────────
    if (access.access === "ALL" && /^sync$/i.test(query.trim())) {
      const result = await syncAllSheets(supabase);
      await sendWhatsAppReply(actualPhone, `✅ *Sync Complete!*\n\n${Object.entries(result).map(([k,v]) => `${k}: ${v}`).join('\n')}`);
      return;
    }

    // ── LOG INCOMING MESSAGE ──────────────────────────────────────────────
    supabase.from("chat_history").insert({ session_id: actualPhone, role: "user", content: query }).then();

    // ── MULTI-TENANT CHECK: Route SaaS users to their own data ────────────
    try {
      const tenantResult = await handleTenantQuery(supabase, actualPhone, query);
      if (tenantResult) {
        if (tenantResult.silent) return res.json({ success: true, ignored: true });

        // Calendar mode — use tenant's own calendar
        if (tenantResult.calendarMode && tenantResult.tenant) {
          const t = tenantResult.tenant;
          try {
            const calReply = await handleTenantCalendarIntent(query, actualPhone, t);
            await sendWhatsAppReply(actualPhone, calReply);
          } catch (e) {
            console.error('[TENANT CALENDAR ERROR]', e.message);
            await sendWhatsAppReply(actualPhone, '❌ Calendar error. Please try again.');
          }
          return res.json({ success: true, tenant: true });
        }

        if (tenantResult.reply) await sendWhatsAppReply(actualPhone, tenantResult.reply);
        // Handle media (chart/PDF/CSV/images)
        if (tenantResult.media) {
          const m = tenantResult.media;
          if (m.type === 'images' && m.items) {
            for (const img of m.items.slice(0, 20)) {
              try {
                await fetch("https://wa.apimis.in/api/v1/whatsapp/meta/sendMessage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-api-key": process.env.WA_ACCESS_TOKEN, "x-phone-id": process.env.WA_PHONE_ID },
                  body: JSON.stringify({ to: formatPhone(actualPhone), message: { type: "image", image: { link: img.url, caption: img.caption || '' } } })
                });
                await new Promise(r => setTimeout(r, 700));
              } catch (e) {}
            }
          } else if (m.path) {
            await sendWhatsAppMedia(actualPhone, m.path, tenantResult.reply || '', m.type === 'image' ? 'image' : 'document');
          }
        }
        return res.json({ success: true, tenant: true });
      }
    } catch(e) {
      console.error("[TENANT ROUTER ERROR]", e.message);
      // Check if user is a registered tenant - if yes, don't fall through
      const { data: tenantCheck } = await supabase.from('tenants').select('id').eq('phone', actualPhone).maybeSingle();
      if (!tenantCheck) {
        const { data: phoneCheck } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', actualPhone).maybeSingle();
        if (phoneCheck) {
          await sendWhatsAppReply(actualPhone, "⚠️ Could not process the query. Please try again.");
          return;
        }
      } else {
        await sendWhatsAppReply(actualPhone, "⚠️ Could not process the query. Please try again.");
        return;
      }
    }
    // If not a tenant user, continue with existing chatbot flow below ──────

    if (!liveSchema) await fetchLiveSchema();

    // ── FIX #8: STOP command — halt image sending ─────────────────────────
    if (/^stop$/i.test(query.trim())) {
      if (wpSessions[actualPhone] && wpSessions[actualPhone].type === "image_sending") {
        wpSessions[actualPhone].stopFlag = true;
        delete wpSessions[actualPhone];
        saveSession(actualPhone);
        await sendWhatsAppReply(actualPhone, "⛔ Image sending stopped.");
        return res.json({ success: true });
      }
      return res.json({ success: true });
    }

    // ── FIX #8: User replies with a number to image_confirm ──────────────
    if (wpSessions[actualPhone]?.type === "image_confirm") {
      const session = wpSessions[actualPhone];
      const numMatch = query.match(/^(\d+)$/);
      if (numMatch) {
        const count = Math.min(parseInt(numMatch[1]), session.products.length);
        delete wpSessions[actualPhone];
        saveSession(actualPhone);
        res.json({ success: true });
        await sendProductImages(actualPhone, session.products.slice(0, count), count);
        return;
      }
      if (/^(all|sabhi|saare|haan|yes|sab)/i.test(query)) {
        const products = session.products;
        delete wpSessions[actualPhone];
        saveSession(actualPhone);
        res.json({ success: true });
        await sendProductImages(actualPhone, products, products.length);
        return;
      }
      // Not a valid reply — treat as new query, clear session
      delete wpSessions[actualPhone];
      saveSession(actualPhone);
    }

    // ── FIX #6: Numbered selection for ledger ────────────────────────────
    if (wpSessions[actualPhone]?.type === "ledger_select" && /^[1-9]$/.test(query.trim())) {
      const session = wpSessions[actualPhone];
      const idx = parseInt(query.trim()) - 1;
      const selectedName = session.options[idx];
      if (!selectedName) {
        await sendWhatsAppReply(actualPhone, `❌ Please enter a number between 1 and ${session.options.length}.`);
        return res.json({ success: true });
      }
      delete wpSessions[actualPhone];
      saveSession(actualPhone);
      const data = await fuzzyLedgerSearch(selectedName);
      if (!data || !data.length) { await sendWhatsAppReply(actualPhone, `❌ Ledger not found.`); return res.json({ success: true }); }
      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const bal  = parseFloat(data[0].closing_balance) || 0;
      await sendWhatsAppReply(actualPhone, `📒 *Ledger: ${selectedName}*\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`);
      res.json({ success: true });
      try {
        const pdfPath = await generateLedgerPDF(data[0], txns);
        await sendWhatsAppMedia(actualPhone, pdfPath, `📄 *${selectedName} — Ledger*\nBalance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}`, "document");
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ PDF error: " + e.message); }
      return;
    }

    // ── CALENDAR STATE: Early-return for multi-turn (confirm/cancel/conflict) ──
    const calState = wpSessions[actualPhone]?.type;
    if (calState === "calendar_booking_confirm" || calState === "calendar_cancel_reason" || calState === "calendar_conflict") {
      const calReply = await handleCalendarIntent("CALENDAR_BOOKING", query, actualPhone);
      await sendWhatsAppReply(actualPhone, calReply);
      return res.json({ success: true });
    }
    // For pending booking (asking name/date/time) — only route if msg is short & looks like a reply
    if (calState === "calendar_booking_pending") {
      const isDataQuery = /sales|expense|pending|ledger|product|kitni|kitne|total|sum|count|list|dikhao|batao/i.test(query);
      if (!isDataQuery && query.length < 100) {
        const calReply = await handleCalendarIntent("CALENDAR_BOOKING", query, actualPhone);
        await sendWhatsAppReply(actualPhone, calReply);
        return res.json({ success: true });
      }
      // Clear stale calendar state — user is asking something else
      delete wpSessions[actualPhone];
      saveSession(actualPhone);
    }

    // ── AI PROCESSING ─────────────────────────────────────────────────────
    // Check cache first
    const cacheKey = query.toLowerCase().trim();
    const cached = getCached(cacheKey);
    if (cached) {
      console.log("[CACHE HIT]", cacheKey);
      await sendWhatsAppReply(actualPhone, cached);
      return res.json({ success: true });
    }

    let plan;
    console.log("⚡ BEFORE EXECUTE PLAN");

    // Save user message to chat_history
    supabase.from("chat_history").insert({ session_id: actualPhone, role: "user", content: query.slice(0, 1500) }).then(() => {}).catch(() => {});

    // Load recent chat history for context
    let chatHistory = [];
    try {
      const { data: wpHistory } = await supabase.from("chat_history").select("role,content").eq("session_id", actualPhone).order("created_at", { ascending: false }).limit(10);
      chatHistory = (wpHistory || []).reverse();
    } catch(e) { /* ignore */ }

    const aiMessage = access.mode === "LIMITED"
      ? query + `\n[SYSTEM: This user has LIMITED access. Filter all queries by their phone/mobile: ${actualPhone.slice(-10)}. Add WHERE condition matching their number in relevant columns (mobile, phone, contact_person)]`
      : query;
    try { plan = await executePlan({
      message: aiMessage,
      sessionId: actualPhone,
      platform: "whatsapp",
      phone: actualPhone,
      chatHistory,
      userAccess: access
    });
    console.log("✅ PLAN RECEIVED");}
    catch(e) { await sendWhatsAppReply(actualPhone, "❌ Could not understand. Please try again."); return res.json({ success: false }); }

    if (plan.query_type === "not_relevant") {
      return;
    }

    // ── CALENDAR HANDLING ─────────────────────────────────────────────────
    if (plan.query_type === "calendar") {
      try {
        const calReply = await handleCalendarIntent(plan.intent, plan.raw_message, actualPhone);
        await sendWhatsAppReply(actualPhone, calReply);
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ Calendar error: " + e.message); }
      return res.json({ success: true });
    }

    // ── CLARIFY (follow-up question) ──────────────────────────────────────
    if (plan.query_type === "clarify") {
      const msg = plan.clarify_message || "Thoda aur detail mein batao.";
      await sendWhatsAppReply(actualPhone, msg);
      return res.json({ success: true });
    }

    // ── LEDGER ────────────────────────────────────────────────────────────
    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) { await sendWhatsAppReply(actualPhone, "Company ka naam batao."); return res.json({ success: true }); }

      const data = await fuzzyLedgerSearch(search);
      if (!data || !data.length) {
        // Try to suggest similar names
        const { data: allNames } = await supabase.from("ledger").select("name").limit(1000);
        const unique = [...new Set((allNames||[]).map(r=>r.name))];
        const words  = search.toLowerCase().split(/\s+/).filter(w=>w.length>2);
        const similar= unique.filter(n => words.some(w => n.toLowerCase().includes(w))).slice(0,5);
        if (similar.length) {
          wpSessions[actualPhone] = { type: "ledger_select", options: similar };
          saveSession(actualPhone);
          await sendWhatsAppReply(actualPhone, `❓ No exact match for "${search}". Did you mean one of these?\n\n` + similar.map((n,i)=>`${i+1}. ${n}`).join("\n") + "\n\nReply with a number (1, 2, 3...)");
        } else {
          await sendWhatsAppReply(actualPhone, `❌ Ledger not found for "${search}".`);
        }
        return res.json({ success: true });
      }

      const uniqueNames = [...new Set(data.map(r=>r.name))];
      if (uniqueNames.length > 1) {
        wpSessions[actualPhone] = { type: "ledger_select", options: uniqueNames.slice(0,8) };
        saveSession(actualPhone);
        await sendWhatsAppReply(actualPhone, `🏢 Multiple companies mili:\n\n` + uniqueNames.slice(0,8).map((n,i)=>`${i+1}. ${n}`).join("\n") + "\n\nNumber bhejo (1, 2, 3...)");
        return res.json({ success: true });
      }

      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const bal  = parseFloat(data[0].closing_balance) || 0;
      const name = data[0].name;
      await sendWhatsAppReply(actualPhone, `📒 *Ledger: ${name}*\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`);
      res.json({ success: true });
      try {
        const pdfPath = await generateLedgerPDF(data[0], txns);
        await sendWhatsAppMedia(actualPhone, pdfPath, `📄 *${name} — Ledger*\nBalance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}`, "document");
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ PDF error: " + e.message); }
      return;
    }

    // ── CHART — only if user asked ────────────────────────────────────────
    if (plan.query_type === "chart" && plan.chart_config) {
      const cfg = plan.chart_config;
      let rows; try { rows = await runSQL(cfg.sql); } catch(e) { await sendWhatsAppReply(actualPhone, "❌ Chart error: " + e.message); return res.json({ success: false }); }
      if (!rows || !rows.length) { await sendWhatsAppReply(actualPhone, "❌ Data nahi mila chart ke liye."); return res.json({ success: true }); }
      res.json({ success: true });
      try {
        const chartURL = buildChartURL(cfg, rows);
        const imgPath  = await downloadChartImage(chartURL);
        await sendWhatsAppMedia(actualPhone, imgPath, `📊 *${cfg.title || "Chart"}*\n_${rows.length} data points_`, "image");
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ Chart nahi ban paya."); }
      return;
    }

    // ── PRODUCTS ──────────────────────────────────────────────────────────
    if (plan.sql && plan.sql.toLowerCase().includes("from products")) {
      let rows; try { rows = await runSQL(plan.sql); } catch(e) { await sendWhatsAppReply(actualPhone, "❌ Error: " + e.message); return res.json({ success: true }); }
      if (!rows || !rows.length) { await sendWhatsAppReply(actualPhone, "❌ Koi product nahi mila."); return res.json({ success: true }); }

      const wantsImages = /image|tasveer|photo|pic|bhej|send|dikhao/i.test(query);

      if (wantsImages) {
        const withImg    = rows.filter(p => p.image_link && p.image_link.startsWith("http"));
        const withoutImg = rows.filter(p => !p.image_link || !p.image_link.startsWith("http"));

        // FIX #8: Ask before sending large batch
        if (withImg.length > 10) {
          wpSessions[actualPhone] = { type: "image_confirm", products: withImg, noImageProducts: withoutImg };
          saveSession(actualPhone);
          const allNames = withImg.map((p,i)=>`${i+1}. ${p.item_name}`).join("\n");
          await sendWhatsAppReply(actualPhone,
            `🛍️ *${rows.length} products mile* (${withImg.length} ke paas image hai)\n\n*Products:*\n${allNames}\n\n` +
            `📸 Kitni images bhejoon?\n• _Number type karo (jaise: 5, 10, 20)_\n• _"all" likho sabhi ke liye_\n• _"stop" likho cancel ke liye_`
          );
          return res.json({ success: true });
        }

        // Small batch — send directly
        const summaryText = `🛍️ *${rows.length} products mile*\n\n` + rows.map((p,i) => `${i+1}. ${p.item_name}`).join("\n");
        await sendWhatsAppReply(actualPhone, summaryText);
        res.json({ success: true });
        await sendProductImages(actualPhone, withImg, withImg.length);
        if (withoutImg.length) {
          await sendWhatsAppReply(actualPhone, `ℹ️ *Image nahi hai:*\n${withoutImg.map(p=>`• ${p.item_name}`).join("\n")}`);
        }
        return;
      }

      // List mode — send ALL product names in chunks
      const CHUNK = 25;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const txt = (i === 0 ? `🛍️ *Total Products: ${rows.length}*\n\n` : `📦 *List continued...*\n\n`) +
          chunk.map((p, idx) => `${i+idx+1}. *${p.item_name}*`).join("\n");
        await sendWhatsAppReply(actualPhone, txt);
        if (i + CHUNK < rows.length) await new Promise(r => setTimeout(r, 600));
      }
      return res.json({ success: true });
    }

    // ── FIX #1: DATA query — show ALL records with "more" handling ────────
    if (!plan.sql) { await sendWhatsAppReply(actualPhone, "⚠️ Yeh query samajh nahi aayi. Thoda aur detail mein poocho."); return res.json({ success: true }); }
    // Phase 8.1: AI self-correcting retry (up to 3 attempts on SQL errors)
    const retryResult = await runSQLWithRetry(plan, query, chatHistory, true);
    if (retryResult.error) {
      await sendWhatsAppReply(actualPhone, `⚠️ Query nahi chal payi. Thoda simple/clear words mein poocho.\n_${String(retryResult.error).substring(0, 80)}_`);
      return res.json({ success: true });
    }
    let rows = retryResult.rows;
    plan = retryResult.plan; // use the (possibly corrected) plan downstream

    if (!rows || !rows.length) {
      // Phase 8.2: pg_trgm fuzzy fallback — suggest similar names when 0 rows
      try {
        const fuzzy = await fuzzyFallbackMis(plan.sql);
        if (fuzzy && fuzzy.matches.length) {
          const list = fuzzy.matches.map((m, i) => `${i + 1}. ${m}`).join("\n");
          await sendWhatsAppReply(actualPhone,
            `📭 No exact match for "${fuzzy.searchTerm}". Did you mean one of these?\n\n${list}\n\nAsk about any of them — or try the correct spelling.`
          );
          return res.json({ success: true });
        }
      } catch (e) {
        console.error("[MIS FUZZY FALLBACK FAILED]", e.message);
      }

      // Phase 10.3: no fuzzy match → try relaxed SQL variants (drop date / loosen ILIKE)
      try {
        const variants = selfHeal.relaxSQL(plan.sql);
        for (let i = 0; i < variants.length; i++) {
          try {
            console.log(`[MIS RELAX ${i + 1}/${variants.length}]`, variants[i].slice(0, 200));
            const relaxedRows = await runSQL(variants[i]);
            if (relaxedRows && relaxedRows.length > 0) {
              console.log(`[MIS RELAX] succeeded with ${relaxedRows.length} rows`);
              rows = relaxedRows;
              plan = { ...plan, sql: variants[i] };
              break;
            }
          } catch (_) { /* relaxed variants are best-effort */ }
        }
      } catch (e) {
        console.error("[MIS RELAX FAILED]", e.message);
      }

      if (!rows || !rows.length) {
        await sendWhatsAppReply(actualPhone, `❌ Koi data nahi mila: "${query}"`);
        return res.json({ success: true });
      }
    }

    // Phase 10.4: result validation — catch single-row-all-NULL aggregates
    const validation = selfHeal.validateResult(rows, query);
    if (!validation.ok && rows.length === 1) {
      const row = rows[0];
      const allNull = Object.keys(row).every(k => row[k] === null || row[k] === undefined);
      if (allNull) {
        console.log(`[MIS VALIDATE] all-null aggregate — ${validation.hint}`);
        await sendWhatsAppReply(actualPhone, `📭 Filter match nahi hua — koi data nahi mila: "${query}"\n\nSpelling, date range, ya category check karo.`);
        return res.json({ success: true });
      }
    }

    // Check if this is a pivot table query (has month column + party/name/category column)
    const cols = Object.keys(rows[0]);
    const hasPivotStructure = cols.includes("month") && (
      cols.includes("party_name") || cols.includes("name") || 
      cols.includes("company_name") || cols.includes("employee_name") ||
      cols.includes("category") || cols.includes("sub_group")
    );

    // Check if multi-column query (4+ columns means user wants detailed data)
    // Examples: invoice_no + amount + gst + link + timestamp
    const isMultiColumn = cols.length >= 4 && !hasPivotStructure;

    // Only send PDF/CSV if user explicitly requested it
    const wantsPDF = /pdf|excel|csv|download|file|document/i.test(query);

    if (wantsPDF && rows.length >= 5) {
      const recordType = hasPivotStructure ? "Pivot Table" : "Data Table";
      
      // For 100+ records, send CSV instead of PDF (better for Excel)
      if (rows.length >= 100) {
        await sendWhatsAppReply(actualPhone, `📊 ${rows.length} records found\n\n📄 Generating Excel CSV file...`);
        res.json({ success: true });
        try {
          const csvCols = Object.keys(rows[0]);
          const csvPath = path.join(os.tmpdir(), `data_${Date.now()}.csv`);
          
          // Check if pivot format needed (has month column)
          if (hasPivotStructure) {
            // Build pivot table
            const nameCol = csvCols.find(c => ["party_name","name","company_name","employee_name","category","sub_group"].includes(c));
            const months = [...new Set(rows.map(r => r.month))].sort();
            const pivot = {};
            const rowTotals = {};
            const colTotals = {};
            months.forEach(m => colTotals[m] = 0);
            
            rows.forEach(r => {
              const name = r[nameCol] || "Other";
              const val = parseFloat(r.total || r.amount || 0);
              if (!pivot[name]) pivot[name] = {};
              pivot[name][r.month] = (pivot[name][r.month] || 0) + val;
              rowTotals[name] = (rowTotals[name] || 0) + val;
              colTotals[r.month] = (colTotals[r.month] || 0) + val;
            });
            
            const sortedNames = Object.keys(pivot).sort((a,b) => (rowTotals[b]||0) - (rowTotals[a]||0));
            const grandTotal = Object.values(rowTotals).reduce((s,v) => s+v, 0);
            
            // CSV header
            let csv = "Party Name," + months.map(m => fmtMonth(m)).join(",") + ",Total\n";
            
            // Data rows with Indian commas (quoted to preserve commas)
            sortedNames.forEach(name => {
              csv += `"${name}",`;
              csv += months.map(m => {
                const val = pivot[name][m] || 0;
                return val > 0 ? `"${val.toLocaleString("en-IN")}"` : "-";
              }).join(",");
              csv += `,"${(rowTotals[name] || 0).toLocaleString("en-IN")}"\n`;
            });
            
            // Grand total row
            csv += "Grand Total,";
            csv += months.map(m => `"${(colTotals[m] || 0).toLocaleString("en-IN")}"`).join(",");
            csv += `,"${grandTotal.toLocaleString("en-IN")}"\n`;
            
            fs.writeFileSync(csvPath, csv, "utf8");
          } else {
            // Regular table format
            const header = csvCols.join(",");
            const body = rows.map(r => csvCols.map(c => {
              const val = String(r[c] ?? "").replace(/"/g, '""');
              return val.includes(",") || val.includes("\n") ? `"${val}"` : val;
            }).join(",")).join("\n");
            fs.writeFileSync(csvPath, header + "\n" + body, "utf8");
          }
          
          await sendWhatsAppMedia(actualPhone, csvPath, `📊 ${recordType}\n${rows.length} records\n\n💡 Open in Excel - Ready pivot table!`, "document");
        } catch(e) { 
          console.error("[CSV ERROR]", e.message);
          await sendWhatsAppReply(actualPhone, `⚠️ CSV error: ${e.message}`);
        }
        return;
      }
      
      // For 20-99 records, send PDF
      await sendWhatsAppReply(actualPhone, `📊 ${rows.length} records found\n\n⏳ Generating ${recordType} PDF...`);
      res.json({ success: true });
      
      try {
        const pdfCols = Object.keys(rows[0]);
        const pdfPath = await generateDataPDF(rows, pdfCols, query.substring(0, 50));
        await sendWhatsAppMedia(actualPhone, pdfPath, `📊 ${recordType}\n${rows.length} records`, "document");
      } catch(e) { 
        console.error("[PDF ERROR]", e.message);
        await sendWhatsAppReply(actualPhone, `⚠️ PDF error: ${e.message}\n\nTry: "Show top 50 ${query}"`);
      }
      return;
    }

    // ── Phase 8.3 + 8.4: Type-aware formatter (replaces regex-based ₹-on-everything bug) ──
    // smart-format infers role per column from key name (currency/quantity/count/date/entity/etc.)
    // For 1 row: vertical key:value layout, no ₹ on counts
    // For 2-15 rows: emoji-bullet list with auto aggregate summary line
    // For 16-20 rows: still shown inline but with summary
    // For >20 rows with aggregatable data: AI summary; otherwise truncated list with grand total

    // Collect link columns separately so we can append them after the type-aware format
    const linkCols = ["invoice_pdf", "del_url", "image_link", "link", "url", "file_url"];
    const linkPerRow = rows.map(r => {
      for (const lc of linkCols) {
        if (r[lc] && String(r[lc]).startsWith("http")) return r[lc];
      }
      return null;
    });

    let replyText;
    if (rows.length <= 20) {
      // Use smart-format on top 20. It handles 1-row vertical and multi-row emoji-bullet.
      const visible = rows.slice(0, 20);
      replyText = smartFormat.formatResults(query, visible, []);

      // formatResults returns null only when rows.length > 15 (its internal threshold).
      // Bridge that here: re-run on the first 15 if so.
      if (!replyText) {
        replyText = smartFormat.formatResults(query, rows.slice(0, 15), []);
      }

      // Append links underneath each line if present (only for multi-row, in declared order)
      if (replyText && rows.length > 1) {
        const linkLines = linkPerRow.slice(0, visible.length).map((url, i) => url ? `   🔗 ${url}` : null);
        if (linkLines.some(Boolean)) {
          // Annotate after each numbered line
          const lines = replyText.split('\n');
          const out = [];
          let rowIdx = 0;
          for (const line of lines) {
            out.push(line);
            // Match a numbered/emoji-bulleted line (start with emoji digit pattern)
            if (/^[1-9️⃣🔟]+/.test(line.trim()) && rowIdx < linkLines.length) {
              if (linkLines[rowIdx]) out.push(linkLines[rowIdx]);
              rowIdx++;
            }
          }
          replyText = out.join('\n');
        }
      } else if (replyText && rows.length === 1 && linkPerRow[0]) {
        replyText += `\n🔗 ${linkPerRow[0]}`;
      }
    } else {
      // > 20 rows: show top 15 inline + truncated note + grand total (via aggregate summary)
      replyText = smartFormat.formatResults(query, rows.slice(0, 15), []) || '';
      replyText += `\n\n_...aur ${rows.length - 15} aur records hain_`;
      // smartFormat already added its "Total across N" line for the 15 shown.
      // Add a true grand total across ALL rows if there's a numeric column.
      const numericKey = Object.keys(rows[0]).find(k => {
        const role = smartFormat.inferRoleFromKey(k, rows[0][k]);
        return role === 'currency' || role === 'count' || role === 'quantity';
      });
      if (numericKey) {
        const role = smartFormat.inferRoleFromKey(numericKey, rows[0][numericKey]);
        const grand = rows.reduce((s, r) => s + (parseFloat(r[numericKey]) || 0), 0);
        const formatted = smartFormat.formatValue(grand, role);
        const label = smartFormat.humanizeLabel(numericKey);
        replyText += `\n💰 *Grand ${label}:* ${formatted}`;
      }
    }

    if (!replyText) {
      replyText = `📊 ${rows.length} records found`;
    }

    setCache(cacheKey, replyText);
    res.json({ success: true, reply: replyText });
    console.log("📤 SENDING FINAL REPLY");
    await sendWhatsAppReply(actualPhone, replyText);

  } catch(err) {
    console.error("[WP ERROR]", err);
    // Send graceful error reply to user
    try {
      const phone = String(req.body?.senderNumber || req.body?.from || req.body?.phone || "").replace(/[^0-9]/g,"");
      if (phone) await sendWhatsAppReply(phone, "⚠️ Something went wrong. Please try again in a moment.\n\n_Error: " + (err.message || "Unknown").substring(0, 100) + "_");
    } catch(e) { console.error("[ERROR REPLY FAILED]", e.message); }
    res.status(200).json({ success: false, error: err.message });
  }
});
async function sendProductImages(phone, products, total) {
  // Phase 22 Sprint 1.10 — cap at 50 images max (WhatsApp rate-limit safety)
  const maxImages = 50;
  const toSend = products.slice(0, maxImages);
  if (products.length > maxImages) {
    await sendWhatsAppReply(phone, `ℹ️ I can send a maximum of ${maxImages} images at a time. Sending the first ${maxImages} now.`);
  }
  // Mark session as image_sending
  wpSessions[phone] = { type: "image_sending", stopFlag: false };
  saveSession(phone);

  let sent = 0;
  for (const p of toSend) {
    if (wpSessions[phone]?.stopFlag) {
      await sendWhatsAppReply(phone, `⛔ Stopped. Sent ${sent}/${total} images.`);
      delete wpSessions[phone];
      saveSession(phone);
      return;
    }
    if (!p.image_link || !p.image_link.startsWith("http")) continue;
    try {
      const caption = `🧸 *${p.item_name}*${p.description ? "\n" + String(p.description).substring(0,80) : ""}`;
      await fetch("https://wa.apimis.in/api/v1/whatsapp/meta/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.WA_ACCESS_TOKEN, "x-phone-id": process.env.WA_PHONE_ID },
        body: JSON.stringify({ to: formatPhone(phone), message: { type: "image", image: { link: p.image_link, caption } } })
      });
      sent++;
      await new Promise(r => setTimeout(r, 700));
    } catch(e) { console.error("[PROD IMG ERROR]", e.message); }
  }

  delete wpSessions[phone];
  saveSession(phone);
  if (sent > 0) await sendWhatsAppReply(phone, `✅ ${sent} images bhej di gayi!`);
}

// ── ACCESS CONTROL ROUTES ──────────────────────────────────────────────────
app.get("/access", requireAuth, (req, res) => res.json(loadAccessControl()));
app.post("/access", requireAuth, (req, res) => {
  const { mode, phone, name, access: userAccess, remove } = req.body;
  const ac = loadAccessControl();
  if (mode) ac.mode = mode; // Set global mode: ALL / LIMITED / LIST
  if (phone && remove) { delete ac.users[phone]; ac.allowed_numbers = ac.allowed_numbers.filter(n => n !== phone); }
  else if (phone) { ac.users[phone] = { name: name || "", access: userAccess || "ALL" }; if (!ac.allowed_numbers.includes(phone)) ac.allowed_numbers.push(phone); }
  fs.writeFileSync(path.join(__dirname, "access_control.json"), JSON.stringify(ac, null, 2));
  _refreshAccessCache(); // Phase 22 Sprint 1.8 — synchronous cache refresh on admin write
  res.json({ ok: true, config: ac });
});

// ── SYNC ROUTES ───────────────────────────────────────────────────────────
const { syncAllSheets } = require("./helpers/sync");

app.post("/sync", requireAuth, async (req, res) => {
  try { res.json({ ok: true, synced: await syncAllSheets(supabase), timestamp: new Date().toISOString() }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/sync", requireAuth, async (req, res) => {
  try { res.json({ ok: true, synced: await syncAllSheets(supabase), timestamp: new Date().toISOString() }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/sync/status", async (req, res) => {
  try {
    const { data } = await supabase.from("sync_log").select("*").order("synced_at", { ascending: false }).limit(20);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

// ── ACCESS CONTROL API ────────────────────────────────────────────────────
const { setupAccessControlColumns, addUserToSheet } = require("./helpers/sheets-write");

app.get("/api/access/users", requireAuth, (req, res) => {
  const ac = loadAccessControl();
  res.json(ac);
});

app.post("/api/access/add-user", requireAuth, async (req, res) => {
  try {
    const { phone, name, accessMode, status, permissions } = req.body;
    
    if (!phone || !name) {
      return res.json({ success: false, error: "Phone and name required" });
    }
    
    // Add to Google Sheet
    const result = await addUserToSheet(phone, name, accessMode, status, permissions);
    
    if (result.success) {
      // Trigger sync to update access_control.json
      await syncAllSheets(supabase);
      res.json({ success: true });
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

app.post("/api/access/setup", requireAuth, async (req, res) => {
  try {
    const result = await setupAccessControlColumns();
    res.json(result);
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

setInterval(() => { console.log("[AUTO-SYNC]"); syncAllSheets(supabase); }, 15 * 60 * 1000);
setTimeout(() => syncAllSheets(supabase), 5000);

// ── PHASE 9.2: Tenant Auto-Sync (every 15 min, offset by 7.5 min) ────────
// Offset from MIS Main sync so we don't burn CPU/network on both at once.
const tenantSync = require("./helpers/tenant-sync");
const TENANT_SYNC_INTERVAL_MS = 15 * 60 * 1000;
setInterval(
  () => tenantSync.syncAllTenants(supabase, { sendWhatsAppReply }).catch(e => console.error('[TENANT-SYNC ERROR]', e.message)),
  TENANT_SYNC_INTERVAL_MS
);
// Warm-up sync at boot — 60s after start so the server can finish initializing
setTimeout(
  () => tenantSync.syncAllTenants(supabase, { sendWhatsAppReply, force: true }).catch(e => console.error('[TENANT-SYNC WARMUP ERROR]', e.message)),
  60 * 1000
);

// Admin endpoint: trigger tenant sync on demand
app.post("/api/tenant/sync-all", requireAuth, async (req, res) => {
  try {
    const r = await tenantSync.syncAllTenants(supabase, { sendWhatsAppReply, force: !!req.body?.force });
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── PHASE F: NOTIFICATIONS & COMMUNICATION ────────────────────────────────
const notifications = require("./helpers/notifications");
const OWNER_PHONE = notifications.OWNER_PHONE;

function sendBookingNotifications(event, parsed, phone) {
  return notifications.sendBookingNotifications(supabase, sendWhatsAppReply, event, parsed, phone);
}
function sendCancellationNotifications(events, reason, phone) {
  return notifications.sendCancellationNotifications(events, reason);
}
function logBooking(event, parsed, action) {
  return notifications.logBooking(supabase, event, parsed, action);
}

setInterval(() => notifications.checkMeetingReminders(sendWhatsAppReply, supabase), 60 * 1000);
setInterval(() => notifications.sendDailySchedule(sendWhatsAppReply, supabase), 60 * 1000);

// ── PHASE 9.5 + 9.6: Tenant-aware Reminders + Daily Schedule ──────────────
// Same cadence as MIS Main but iterate every calendar-connected tenant.
// Each tenant uses their own OAuth refresh token + calendar_id.
const tenantNotifs = require("./helpers/tenant-notifications");
setInterval(() => tenantNotifs.checkTenantReminders(supabase, sendWhatsAppReply).catch(e => console.error('[TENANT REMINDER LOOP]', e.message)), 60 * 1000);
setInterval(() => tenantNotifs.sendTenantDailySchedules(supabase, sendWhatsAppReply).catch(e => console.error('[TENANT DAILY LOOP]', e.message)), 60 * 1000);

// ── DOCUMENT INTELLIGENCE ─────────────────────────────────────────────────
app.post("/doc-intelligence", async (req, res) => {
  const { doc_url, doc_type, question, uploaded_by } = req.body;
  if (!doc_url) return res.status(400).json({ error: "doc_url required" });
  // SSRF protection: only allow safe domains
  const allowed = ['docs.google.com', 'drive.google.com', 'sheets.google.com'];
  try {
    const urlObj = new URL(doc_url);
    if (!allowed.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d))) {
      return res.status(400).json({ error: "Only Google Docs/Drive/Sheets URLs allowed" });
    }
    if (urlObj.protocol !== 'https:') return res.status(400).json({ error: "Only HTTPS URLs allowed" });
  } catch(e) { return res.status(400).json({ error: "Invalid URL" }); }
  try {
    let extractedText = "", docTitle = doc_url.substring(0, 80);
    if (doc_type === "google_sheet" || doc_url.includes("docs.google.com/spreadsheets")) {
      const match = doc_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const gidMatch = doc_url.match(/gid=(\d+)/);
      if (!match) throw new Error("Invalid Google Sheet URL");
      const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gidMatch?.[1]||"0"}`;
      const csvRes = await fetch(csvUrl);
      if (!csvRes.ok) throw new Error("Could not fetch Google Sheet.");
      extractedText = (await csvRes.text()).substring(0, 8000);
      docTitle = "Google Sheet";
    } else if (doc_type === "pdf" || doc_url.includes(".pdf") || doc_url.includes("drive.google.com")) {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST", headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
        body: JSON.stringify({ model:"gpt-4o", max_tokens:2000, messages:[{ role:"user", content:`Read and summarize: ${doc_url}\nQuestion: ${question||"Summarize"}` }] })
      });
      const summary = (await aiRes.json()).choices?.[0]?.message?.content || "Could not read.";
      await supabase.from("doc_intelligence").insert({ doc_type:"pdf", doc_url, doc_title:docTitle, ai_summary:summary, uploaded_by:uploaded_by||"web" });
      return res.json({ ok:true, summary, doc_type:"pdf" });
    } else {
      try { extractedText = (await (await fetch(doc_url,{headers:{"User-Agent":"Mozilla/5.0"}})).text()).replace(/<[^>]*>/g," ").substring(0,6000); } catch(e) { extractedText = `URL: ${doc_url}`; }
    }
    const aiRes2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({ model:"gpt-4o", max_tokens:2000, messages:[
        { role:"system", content:"You are a document analysis assistant for Mis Work India. Analyze content and answer questions accurately." },
        { role:"user", content:`Content:\n${extractedText}\n\nQuestion: ${question||"Summarize"}` }
      ]})
    });
    const summary = (await aiRes2.json()).choices?.[0]?.message?.content || "Could not analyze.";
    await supabase.from("doc_intelligence").insert({ doc_type:doc_type||"url", doc_url, doc_title:docTitle, ai_summary:summary, raw_content:extractedText.substring(0,2000), uploaded_by:uploaded_by||"web" });
    res.json({ ok:true, summary, doc_type:doc_type||"url" });
  } catch(err) { res.status(500).json({ ok:false, error:err.message }); }
});

app.get("/doc-intelligence/history", async (req, res) => {
  try {
    const { data } = await supabase.from("doc_intelligence").select("id,doc_type,doc_title,doc_url,ai_summary,created_at").order("created_at",{ascending:false}).limit(20);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

app.post("/analyze-image", async (req, res) => {
  const { base64, mediaType } = req.body;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({ model:"gpt-4o", max_tokens:1000, messages:[{ role:"user", content:[
        { type:"image_url", image_url:{ url:`data:${mediaType};base64,${base64}` } },
        { type:"text", text:"Describe this image. Extract any text. If product, describe it." }
      ]}]})
    });
    res.json({ summary: (await response.json()).choices?.[0]?.message?.content || "Could not analyze" });
  } catch(e) { res.json({ summary:"Error: "+e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-TENANT SaaS API ROUTES
// ══════════════════════════════════════════════════════════════════════════════
const { detectSchema: detectSheetSchema, syncSheetToSupabase, syncSheetToProperTables, extractSheetId } = require('./helpers/sheets');
const { generateSystemPrompt } = require('./helpers/prompt');
const { handleTenantQuery, invalidateTenantCache, setPendingCalendar, getPendingCalendar, clearPendingCalendar } = require('./helpers/tenant-router');
const tenantCalHelper = require('./helpers/tenant-calendar');

// Tenant calendar intent handler — booking / retrieve / cancel + recurring.
// Phase 2 (multi-turn): if pendingCalendar state exists for this phone, the
// user's reply is treated as a date/time follow-up — merged with the original
// query and re-parsed.
// Phase 3 (bulk/recurring): AI parses recurring + count + interval; we loop
// createEvent for each occurrence (capped at 365 to avoid runaway bookings).
async function handleTenantCalendarIntent(query, phone, tenant) {
  const refreshToken = tenant.calendar_refresh_token;
  const calendarId = tenant.calendar_id || 'primary';

  // ── Phase 2: merge original booking query with the follow-up reply ──────
  // E.g. original was "buk meeing with sarans h ji from this wed weekly",
  // user replied "27 May" → effective query becomes the merged sentence so
  // the AI has all the context in one shot.
  let effectiveQuery = query;
  const pending = getPendingCalendar(phone);
  if (pending) {
    const connector =
      pending.expecting === 'date' ? ' on ' :
      pending.expecting === 'time' ? ' at ' :
      ' ';
    effectiveQuery = `${pending.originalQuery}${connector}${query}`;
    // Don't clear yet — only clear on definitive success/failure paths below.
  }

  const q = effectiveQuery.toLowerCase();

  // RETRIEVE: "aaj ki meetings", "today meetings", "meeking list"
  if (
    !pending && // skip retrieve when we're in a booking follow-up
    /\b(aaj|today)\b|meetings?\s*(batao|dikhao|list)|meeking\s*list|coming\s*week\s*meet|schedule/i.test(q) &&
    !/\b(book|buk|cancel)\b/i.test(q)
  ) {
    const events = await tenantCalHelper.getTodayEvents(refreshToken, calendarId);
    if (!events.length) return '📅 No meetings scheduled.';
    const list = events.map((e, i) => {
      const start = new Date(e.start.dateTime || e.start.date);
      const time = start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${i + 1}. ⏰ ${time} — ${e.summary || 'No title'}`;
    }).join('\n');
    return `📅 *Today's meetings (${events.length}):*\n\n${list}`;
  }

  // CANCEL
  if (!pending && /\b(cancel|delete|hatao|remove)\b/i.test(q)) {
    const events = await tenantCalHelper.getTodayEvents(refreshToken, calendarId);
    if (!events.length) return '📅 No meetings today to cancel.';
    if (events.length === 1) {
      await tenantCalHelper.deleteEvent(refreshToken, calendarId, events[0].id);
      return `✅ Meeting cancelled: *${events[0].summary}*`;
    }
    const list = events.map((e, i) => `${i + 1}. ${e.summary || 'No title'}`).join('\n');
    return `📅 Which one would you like to cancel?\n\n${list}\n\n_For now I am cancelling the first one — say "cancel [name]" to pick a specific one._`;
  }

  // ── BOOK: Use AI to parse booking details (incl. recurring) ───────────
  const today = new Date().toISOString().split('T')[0];
  const parsePrompt = `Extract meeting details from this message. Return JSON only — no prose.
Message: "${effectiveQuery}"
Today: ${today}

Return EXACTLY this shape:
{
  "title": "meeting title (short — agenda or 'Meeting' if none)",
  "date": "YYYY-MM-DD or 'ASK' if cannot infer",
  "time": "HH:MM in 24-hour, or 'ASK' if cannot infer",
  "duration_min": 60,
  "guest": "name if mentioned, else null",
  "guest_email": "email@domain.com if a valid email appears, else null",
  "recurring": "none | daily | weekly | monthly",
  "count": 1,
  "interval_days": 0
}

Rules:
- If user says "every Monday", "weekly", "har Monday" → recurring="weekly", interval_days=7
- If user says "daily", "har din" → recurring="daily", interval_days=1
- If user says "monthly", "har mahine" → recurring="monthly", interval_days=30
- If user says "till next year" or "for 1 year" with weekly → count=52
- If user says "for 3 months" with weekly → count=13
- If user says "for next 4 weeks" weekly → count=4
- If single one-off meeting → recurring="none", count=1, interval_days=0
- "this wed" / "this Wednesday" / "coming wed" / "next wed" → resolve to the upcoming Wednesday's date (never past).
- "tomorrow" / "kal" → tomorrow's date.
- "today" / "aaj" / "tdy" → today's date.
- If user provides only a time (e.g. "3 PM") with no date AND it's a follow-up to a previous booking, set date='ASK'.
- If user provides only a date AND it's a follow-up, set time='ASK'.
- Cap count at 365 — if user wants more, set count=365.`;

  let parsed;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: parsePrompt }], temperature: 0, max_tokens: 250 })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    parsed = JSON.parse(content.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } catch (e) {
    clearPendingCalendar(phone);
    return '🤔 Could not understand the meeting details. Try: "Book a meeting with Sharma at 3 PM tomorrow".';
  }

  // Belt-and-braces: regex-extract email if AI missed it
  if (!parsed.guest_email) {
    const m = effectiveQuery.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    if (m) parsed.guest_email = m[0];
  }

  // ── Phase 2: ASK if date or time still missing (save pending state) ────
  if (!parsed.date || parsed.date === 'ASK') {
    setPendingCalendar(phone, {
      tenant,
      originalQuery: effectiveQuery,
      expecting: 'date',
    });
    return `📅 To book *${parsed.title || 'Meeting'}*, please tell me the date.\n\nExample: "27 May", "tomorrow", "next Monday"`;
  }
  if (!parsed.time || parsed.time === 'ASK') {
    setPendingCalendar(phone, {
      tenant,
      originalQuery: effectiveQuery,
      expecting: 'time',
    });
    return `📅 To book *${parsed.title || 'Meeting'}* on ${parsed.date}, please tell me the time.\n\nExample: "3 PM" or "4:30 PM"`;
  }

  // Both date + time present → we're done collecting context
  clearPendingCalendar(phone);

  // ── Phase 3: build occurrences (cap at 365) ─────────────────────────────
  const recurring = (parsed.recurring || 'none').toLowerCase();
  let count = Math.max(1, Math.min(parseInt(parsed.count) || 1, 365));
  let intervalDays = parseInt(parsed.interval_days) || 0;
  if (recurring === 'daily')   intervalDays = intervalDays || 1;
  if (recurring === 'weekly')  intervalDays = intervalDays || 7;
  if (recurring === 'monthly') intervalDays = intervalDays || 30;
  if (recurring === 'none' || count === 1) { count = 1; intervalDays = 0; }

  const baseStart = new Date(`${parsed.date}T${parsed.time}:00+05:30`);
  if (isNaN(baseStart.getTime())) {
    return `🤔 Could not parse the date/time. Got date="${parsed.date}", time="${parsed.time}". Try: "27 May 3 PM".`;
  }
  const durationMin = parsed.duration_min || 60;
  const guestEmails = parsed.guest_email ? [parsed.guest_email] : [];
  const titleBase = parsed.guest ? `${parsed.title || 'Meeting'} with ${parsed.guest}` : (parsed.title || 'Meeting');

  // Create each occurrence — error-isolated so a single failure doesn't kill the whole batch.
  const created = [];
  const failed = [];
  for (let i = 0; i < count; i++) {
    const startTime = new Date(baseStart.getTime() + i * intervalDays * 86400000).toISOString();
    const endTime   = new Date(new Date(startTime).getTime() + durationMin * 60000).toISOString();
    try {
      const event = await tenantCalHelper.createEvent(refreshToken, calendarId, {
        title: titleBase,
        startTime,
        endTime,
        description: parsed.guest ? `Guest: ${parsed.guest}${parsed.guest_email ? ' <' + parsed.guest_email + '>' : ''}` : '',
        guests: guestEmails,
      });
      created.push({ event, startTime, endTime });
    } catch (e) {
      console.error(`[TENANT BOOK ERROR ${i+1}/${count}]`, e.message);
      failed.push({ startTime, error: e.message });
    }
  }

  if (!created.length) {
    return `❌ Could not create any meeting. Error: ${failed[0]?.error || 'unknown'}.`;
  }

  // ── Confirmation email + WhatsApp notif ───────────────────────────────
  // For bulk bookings, send ONE summary email/notif (not N).
  const first = created[0];
  const last  = created[created.length - 1];
  const firstStart = new Date(first.startTime);
  const lastStart  = new Date(last.startTime);
  const fmtDate = d => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short', year: 'numeric' });
  const fmtTime = d => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  // Email (one summary mail)
  try {
    const summaryEvent = first.event;
    const parsedForEmail = {
      title: summaryEvent.summary || titleBase,
      startTime: first.startTime,
      endTime:   first.endTime,
      description: parsed.guest ? `Guest: ${parsed.guest}${parsed.guest_email ? ' <' + parsed.guest_email + '>' : ''}` : '',
      guests: guestEmails.slice(),
    };
    const html = notifications.formatBookingEmailHTML(summaryEvent, parsedForEmail);
    const subj = created.length > 1
      ? `${created.length} Meetings Confirmed: ${summaryEvent.summary}`
      : `Meeting Confirmed: ${summaryEvent.summary}`;
    const sentTo = [];
    if (tenant.email && /@/.test(tenant.email)) {
      notifications.sendEmail(tenant.email, subj, html).catch(e => console.error('[TENANT EMAIL OWNER]', e.message));
      sentTo.push(tenant.email);
    }
    for (const g of guestEmails) {
      if (g && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g) && !sentTo.includes(g)) {
        notifications.sendEmail(g, subj, html).catch(e => console.error('[TENANT EMAIL GUEST]', e.message));
        sentTo.push(g);
      }
    }
    notifications.logBooking(supabase, summaryEvent, parsedForEmail, 'booked').catch(() => {});
    if (sentTo.length) console.log(`[TENANT BOOKING EMAIL] sent to: ${sentTo.join(', ')}`);
  } catch (e) {
    console.error('[TENANT BOOKING EMAIL ERROR]', e.message);
  }

  // WhatsApp summary
  const whenLine = created.length > 1
    ? `📅 ${fmtDate(firstStart)} → ${fmtDate(lastStart)} (${recurring})`
    : `📅 ${fmtDate(firstStart)}`;
  const notifMsg = `📅 *${created.length > 1 ? `${created.length} Meetings Booked!` : 'New Meeting Booked!'}*\n\n📌 ${first.event.summary}\n${whenLine}\n⏰ ${fmtTime(firstStart)}\n🔗 ${first.event.meetLink || first.event.htmlLink}`;
  sendWhatsAppReply(phone, notifMsg).catch(() => {});

  // Reply to caller
  const emailHint = (tenant.email || parsed.guest_email)
    ? `\n📧 Confirmation email sent${parsed.guest_email && parsed.guest_email !== tenant.email ? ' to guest as well' : ''}.`
    : '\n💡 Tip: Add an email at signup so confirmation emails can be sent.';
  const failedNote = failed.length ? `\n⚠️ ${failed.length} occurrence(s) failed — see calendar.` : '';

  if (created.length === 1) {
    return `✅ *Meeting booked!*\n\n📌 ${first.event.summary}\n📅 ${fmtDate(firstStart)}\n⏰ ${fmtTime(firstStart)}\n🔗 ${first.event.meetLink || 'See in Calendar'}${emailHint}${failedNote}`;
  }
  return `✅ *${created.length} meetings booked!*\n\n📌 ${first.event.summary}\n📅 ${fmtDate(firstStart)} → ${fmtDate(lastStart)}\n🔁 ${recurring} (every ${intervalDays} day${intervalDays === 1 ? '' : 's'})\n⏰ ${fmtTime(firstStart)}\n🔗 ${first.event.meetLink || 'See in Calendar'}${emailHint}${failedNote}`;
}

// Health check — Phase 10: actually pings the DB so monitoring catches DB outages.
// Returns 200 only if the round-trip succeeds; 503 with diagnostics otherwise.
app.get('/health', async (req, res) => {
  const ping = await selfHeal.pingDb(supabase, { timeoutMs: 3000 });
  const body = {
    status: ping.ok ? 'ok' : 'degraded',
    uptime: process.uptime() | 0,
    db: {
      ok: ping.ok,
      latency_ms: ping.latencyMs,
      ...(ping.error ? { error: ping.error } : {}),
    },
    timestamp: new Date().toISOString(),
  };
  res.status(ping.ok ? 200 : 503).json(body);
});

// Check if phone is already registered (returning user detection)
app.post('/api/tenant/check-phone', async (req, res) => {
  try {
    const phone = (req.body.phone || '').replace(/[^0-9]/g, '');
    if (phone.length < 10) return res.status(400).json({ error: 'Valid phone required' });
    const { data: tenant } = await supabase.from('tenants').select('id, name, sheet_url, schema_json, created_at').eq('phone', phone).single();
    if (!tenant) {
      const { data: mapping } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).single();
      if (mapping) {
        const { data: t } = await supabase.from('tenants').select('id, name, sheet_url, schema_json, created_at').eq('id', mapping.tenant_id).single();
        if (t) return res.json({ exists: true, tenant: t });
      }
      return res.json({ exists: false });
    }
    res.json({ exists: true, tenant });
  } catch (e) {
    res.json({ exists: false });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 20 SPRINT 2 — DYNAMIC DASHBOARD API
//   GET  /api/dashboard?phone=91...&range=today|week|month|quarter|year|all
//   Returns: { tenant, range, date_range, detected_roles, widgets:[...] }
//   Auth: phone-based (same model as the chat). Resolved via tenants.phone OR
//         tenant_phones mapping. user_databases default DB also honoured.
// ════════════════════════════════════════════════════════════════════════════
const { buildDashboard, _internals: dashEngineInternals } = require('./helpers/dashboard-engine');

app.get('/api/dashboard', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const range = String(req.query.range || 'month');
    const explicitTenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;
    if (!phone || phone.length < 10) return res.status(400).json({ error: 'phone required' });

    let tenantId = explicitTenantId;

    // Resolve tenant from phone if not explicitly provided.
    // Order: user_databases default → tenants.phone → tenant_phones mapping.
    if (!tenantId) {
      const { data: defaultDb } = await supabase
        .from('user_databases')
        .select('tenant_id')
        .eq('phone', phone)
        .eq('is_default', true)
        .maybeSingle();
      if (defaultDb?.tenant_id) tenantId = defaultDb.tenant_id;
    }
    if (!tenantId) {
      const { data: t } = await supabase.from('tenants').select('id').eq('phone', phone).maybeSingle();
      if (t?.id) tenantId = t.id;
    }
    if (!tenantId) {
      const { data: m } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).maybeSingle();
      if (m?.tenant_id) tenantId = m.tenant_id;
    }
    if (!tenantId) return res.status(404).json({ error: 'No tenant found for this phone' });

    const t0 = Date.now();
    const dash = await buildDashboard(supabase, tenantId, { range });
    dash.elapsed_ms = Date.now() - t0;
    res.json(dash);
  } catch (e) {
    console.error('[DASHBOARD ERROR]', e.message);
    res.status(500).json({ error: 'Dashboard generation failed: ' + e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// AI BRIEFING — Phase 22 Sprint 3A
//   GET /api/briefing?phone=...&range=month
//   Returns 3 short paragraphs (recap + change + anomaly note) generated by
//   gpt-4o-mini from the widget summaries. Cached 1 hour per (tenant, range).
// ════════════════════════════════════════════════════════════════════════════
const _briefingCache = new Map(); // key → { text, ts }
const BRIEFING_TTL_MS = 60 * 60 * 1000;

function _briefingFromDash(dash) {
  // Compact summary for the LLM — limited to relevant numbers, no PII risk
  const widgets = (dash.widgets || []).filter(w => w.ok);
  const out = {
    tenant: dash.tenant?.name,
    range: dash.range,
    date_from: dash.date_range?.from,
    date_to: dash.date_range?.to,
    prev_from: dash.prev_range?.from,
    prev_to: dash.prev_range?.to,
    kpis: {},
    top: {}
  };
  widgets.forEach(w => {
    if (w.kind === 'kpi') {
      out.kpis[w.id.replace('kpi.', '')] = {
        title: w.title,
        value: w.data?.value,
        prev: w.data?.prev,
        delta_pct: w.data?.delta_pct,
        format: w.data?.format
      };
    } else if (w.id === 'table.top_customers') {
      out.top.customers = (w.data?.rows || []).slice(0, 5).map(r => ({ party: r.party, total: r.total }));
    } else if (w.id === 'table.top_items') {
      out.top.items = (w.data?.rows || []).slice(0, 5).map(r => ({ item: r.item, total: r.total }));
    }
  });
  return out;
}

app.get('/api/briefing', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const range = String(req.query.range || 'month');
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant for this phone' });

    // Cache check
    const cacheKey = `${tenantId}:${range}`;
    const cached = _briefingCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < BRIEFING_TTL_MS) {
      return res.json({ briefing: cached.text, cached: true });
    }

    // Build summary
    const dash = await buildDashboard(supabase, tenantId, { range });
    if (dash.empty) {
      return res.json({ briefing: dash.message || 'No data yet — sync your sheet to populate insights.', empty: true });
    }
    const summary = _briefingFromDash(dash);

    // OpenAI call
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ briefing: 'AI briefing unavailable — OPENAI_API_KEY not set.', error: true });
    }
    const prompt = `You are a concise business analyst writing a 3-sentence briefing for a tenant's dashboard. Use the JSON below to summarise (1) the headline result for the period, (2) the most notable change vs the previous period, and (3) one observation worth attention (top customer, anomaly, or trend). Use Indian currency formatting (₹ X.XX Cr / L / K). Keep total under 60 words. Reply in plain text, no markdown, no headings, no bullet lists.

DATA:
${JSON.stringify(summary, null, 2)}`;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 220 }),
      signal: ctrl.signal
    }).catch(e => { clearTimeout(timer); throw e; });
    clearTimeout(timer);

    if (!resp.ok) {
      const errBody = await resp.text();
      console.error('[BRIEFING] OpenAI error:', resp.status, errBody.slice(0, 200));
      return res.json({ briefing: 'AI briefing temporarily unavailable. Showing baseline summary instead.', error: true });
    }
    const data = await resp.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (!text) return res.json({ briefing: 'No briefing generated.', error: true });

    _briefingCache.set(cacheKey, { text, ts: Date.now() });
    res.json({ briefing: text, cached: false });
  } catch (e) {
    console.error('[/api/briefing]', e.message);
    res.status(500).json({ error: 'Briefing generation failed: ' + e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 20 SPRINT 3 — TENANT-AWARE CHAT SUGGESTION CHIPS
//   GET /api/chat-suggestions?phone=91...&limit=6
//   Returns: { tenant: {id,name}, roles, chips:[{label,prompt,icon,kind}] }
//   Auth: phone-based (same model as /api/dashboard).
//   Falls back to a friendly generic chip set if the tenant has no usable
//   tables_metadata (also keeps the chat UI useful for not-yet-onboarded users).
// ════════════════════════════════════════════════════════════════════════════
const { buildChatSuggestions } = require('./helpers/chat-suggestions');

app.get('/api/chat-suggestions', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 8);
    const explicitTenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;

    // Anonymous / no phone supplied → generic fallback chips, never an error.
    if ((!phone || phone.length < 10) && !explicitTenantId) {
      const fallback = buildChatSuggestions([], { limit });
      return res.json({ tenant: null, roles: [], chips: fallback.chips });
    }

    // Resolve tenant: explicit id wins, otherwise default DB → tenants.phone → tenant_phones.
    let tenantId = explicitTenantId;
    if (!tenantId && phone) {
      const { data: defaultDb } = await supabase
        .from('user_databases')
        .select('tenant_id')
        .eq('phone', phone)
        .eq('is_default', true)
        .maybeSingle();
      if (defaultDb?.tenant_id) tenantId = defaultDb.tenant_id;
    }
    if (!tenantId && phone) {
      const { data: t } = await supabase.from('tenants').select('id').eq('phone', phone).maybeSingle();
      if (t?.id) tenantId = t.id;
    }
    if (!tenantId && phone) {
      const { data: m } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).maybeSingle();
      if (m?.tenant_id) tenantId = m.tenant_id;
    }

    // No tenant → still return generic chips so the UI never looks empty.
    if (!tenantId) {
      const fallback = buildChatSuggestions([], { limit });
      return res.json({ tenant: null, roles: [], chips: fallback.chips });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, tables_metadata')
      .eq('id', tenantId)
      .maybeSingle();

    const meta = (tenant && tenant.tables_metadata) || [];
    const result = buildChatSuggestions(meta, { limit });

    res.json({
      tenant: tenant ? { id: tenant.id, name: tenant.name } : null,
      roles: result.roles,
      chips: result.chips,
    });
  } catch (e) {
    console.error('[CHAT-SUGGESTIONS ERROR]', e.message);
    // Even on hard failure, return the generic chip set so the UI never breaks.
    const fallback = buildChatSuggestions([], { limit: 6 });
    res.json({ tenant: null, roles: [], chips: fallback.chips, _warn: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PHASE 22 SPRINT 4 — DRILL-DOWN PAGES
//   GET /api/page/sales       ?phone=...&from=...&to=...&q=...&page=1
//   GET /api/page/outstanding ?phone=...&as_of=...
//   GET /api/page/stock       ?phone=...
//   GET /api/page/ledger      ?phone=...&q=<party>
//   Auth: same phone-based 3-step resolution as /api/dashboard.
// ════════════════════════════════════════════════════════════════════════════
const { buildPageData } = require('./helpers/page-engine');

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS PAGE — Phase 22 Sprint 2A/2F
// ════════════════════════════════════════════════════════════════════════════

// GET /api/tenant/profile?phone=...
//   Returns: { tenant_id, name, email, phone, calendar_connected,
//              calendar_email, last_sync_at, databases:[], active_db_id }
app.get('/api/tenant/profile', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const activeId = await resolveTenantIdFromPhone(phone);
    if (!activeId) return res.status(404).json({ error: 'No tenant for this phone' });

    // Active tenant detail — only request columns that actually exist
    const { data: t, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, email, phone, calendar_connected, tables_metadata, updated_at')
      .eq('id', activeId)
      .maybeSingle();

    if (tErr) return res.status(500).json({ error: tErr.message });
    if (!t) return res.status(404).json({ error: 'Tenant not found' });

    // Derive a "last sync" timestamp from tables_metadata (set by sync helper)
    // or fall back to updated_at.
    let lastSync = null;
    try {
      const meta = t.tables_metadata;
      if (meta && typeof meta === 'object') {
        // tables_metadata is { tabs: { tabName: { ..., synced_at } } }
        const tabs = meta.tabs || meta;
        for (const k of Object.keys(tabs)) {
          const v = tabs[k];
          const ts = v?.synced_at || v?.last_synced || v?.last_sync_at;
          if (ts && (!lastSync || new Date(ts) > new Date(lastSync))) lastSync = ts;
        }
      }
    } catch (_) {}
    if (!lastSync) lastSync = t.updated_at || null;

    // All databases owned/accessible by this phone
    // 1. owned (tenants.phone)
    const owned = (await supabase.from('tenants').select('id, name').eq('phone', phone)).data || [];
    // 2. linked via user_databases (no role column — alias instead)
    const { data: links } = await supabase
      .from('user_databases')
      .select('tenant_id, alias, tenants(id, name)')
      .eq('phone', phone);

    const dbs = new Map();
    owned.forEach(o => dbs.set(o.id, { tenant_id: o.id, name: o.name, role: 'owner' }));
    (links || []).forEach(l => {
      if (l.tenants?.id) {
        const existing = dbs.get(l.tenants.id);
        dbs.set(l.tenants.id, {
          tenant_id: l.tenants.id,
          name: l.alias || l.tenants.name,
          role: existing?.role || 'member'
        });
      }
    });

    res.json({
      tenant_id: t.id,
      name: t.name || '',
      email: t.email || '',
      phone: t.phone || phone,
      calendar_connected: !!t.calendar_connected,
      calendar_email: '', // not stored in current schema
      last_sync_at: lastSync,
      databases: Array.from(dbs.values()),
      active_db_id: activeId
    });
  } catch (e) {
    console.error('[/api/tenant/profile]', e.message);
    res.status(500).json({ error: 'Could not load profile' });
  }
});

// POST /api/tenant/update-profile
//   Body: { phone, name?, email? }
//   Updates the active tenant's name + email. Phone is read-only here.
app.post('/api/tenant/update-profile', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant for this phone' });

    const update = {};
    if (req.body.name !== undefined) {
      const n = String(req.body.name).trim().slice(0, 100);
      if (n.length < 2) return res.status(400).json({ error: 'Name too short (min 2 chars)' });
      update.name = n.replace(/<[^>]*>/g, ''); // strip HTML
    }
    if (req.body.email !== undefined) {
      const e = String(req.body.email).trim().toLowerCase().slice(0, 254);
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return res.status(400).json({ error: 'Invalid email' });
      }
      update.email = e;
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to update' });

    const { data, error } = await supabase
      .from('tenants')
      .update(update)
      .eq('id', tenantId)
      .select('id, name, email')
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, ...data });
  } catch (e) {
    console.error('[/api/tenant/update-profile]', e.message);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// POST /api/tenant/update-email — small dedicated endpoint per Sprint 2F
//   Body: { phone, email }
app.post('/api/tenant/update-email', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant for this phone' });
    const { error } = await supabase.from('tenants').update({ email }).eq('id', tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, email });
  } catch (e) {
    console.error('[/api/tenant/update-email]', e.message);
    res.status(500).json({ error: 'Could not update email' });
  }
});

// POST /api/tenant/switch-db
//   Body: { phone, tenant_id } — sets is_default=true on chosen row
app.post('/api/tenant/switch-db', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    const tenantId = String(req.body.tenant_id || '');
    if (!phone || !tenantId) return res.status(400).json({ error: 'phone + tenant_id required' });

    // First clear all defaults for this phone
    await supabase.from('user_databases').update({ is_default: false }).eq('phone', phone);
    // Set new default — upsert in case the link doesn't exist yet (no role
    // column in user_databases; alias is optional)
    const { error } = await supabase
      .from('user_databases')
      .upsert({ phone, tenant_id: tenantId, is_default: true }, { onConflict: 'phone,tenant_id' });

    // Persist to .db_selections.json so tenant-router uses it on next query
    try {
      const sel = JSON.parse(fs.readFileSync(path.join(__dirname, '.db_selections.json'), 'utf8') || '{}');
      sel[phone] = tenantId;
      fs.writeFileSync(path.join(__dirname, '.db_selections.json'), JSON.stringify(sel, null, 2));
    } catch (_) {}

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, active_tenant_id: tenantId });
  } catch (e) {
    console.error('[/api/tenant/switch-db]', e.message);
    res.status(500).json({ error: 'Could not switch database' });
  }
});

// POST /api/tenant/calendar/disconnect
//   Body: { phone } — clears calendar_refresh_token for the active tenant
app.post('/api/tenant/calendar/disconnect', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant' });
    const { error } = await supabase
      .from('tenants')
      .update({ calendar_connected: false, calendar_refresh_token: null })
      .eq('id', tenantId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/tenant/calendar/disconnect]', e.message);
    res.status(500).json({ error: 'Could not disconnect' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CALENDAR PAGE — Phase 22 Sprint 2B
// ════════════════════════════════════════════════════════════════════════════
// (uses tenantCalHelper already required earlier in the file)

// Helper: load tenant + verify calendar connected
async function _getCalendarTenant(phone) {
  const tenantId = await resolveTenantIdFromPhone(phone);
  if (!tenantId) return { error: 'No tenant for this phone', code: 404 };
  const { data: t } = await supabase
    .from('tenants')
    .select('id, name, calendar_id, calendar_connected, calendar_refresh_token, email')
    .eq('id', tenantId)
    .maybeSingle();
  if (!t) return { error: 'Tenant not found', code: 404 };
  if (!t.calendar_connected || !t.calendar_refresh_token) {
    return { error: 'Calendar not connected', code: 412, tenant: t };
  }
  return { tenant: t };
}

// GET /api/tenant/calendar/events?phone=...&from=YYYY-MM-DD&to=YYYY-MM-DD
app.get('/api/tenant/calendar/events', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const r = await _getCalendarTenant(phone);
    if (r.error) return res.status(r.code).json({ error: r.error });

    // Default range: current month +/- a small buffer for grid spillover
    const today = new Date();
    const from = req.query.from
      ? new Date(req.query.from + 'T00:00:00').toISOString()
      : new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    const to = req.query.to
      ? new Date(req.query.to + 'T23:59:59').toISOString()
      : new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString();

    const events = await tenantCal.getEvents(r.tenant.calendar_refresh_token, r.tenant.calendar_id, from, to);
    res.json({
      tenant: { id: r.tenant.id, name: r.tenant.name },
      range: { from, to },
      events: events.map(e => ({
        id: e.id,
        title: e.summary || '(untitled)',
        description: e.description || '',
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        all_day: !e.start?.dateTime,
        attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
        location: e.location || '',
        meet_link: (e.description || '').match(/https:\/\/meet\.[a-z.\/-]+\S+/i)?.[0] || ''
      }))
    });
  } catch (e) {
    console.error('[/api/tenant/calendar/events]', e.message);
    res.status(500).json({ error: e.message || 'Could not load events' });
  }
});

// POST /api/tenant/calendar/book
//   Body: { phone, title, start, end, description?, guests?:[email,...] }
//   Includes basic conflict detection — fails if an event overlaps the slot.
app.post('/api/tenant/calendar/book', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    const { title, start, end, description, guests, force } = req.body;
    if (!phone)  return res.status(400).json({ error: 'phone required' });
    if (!title)  return res.status(400).json({ error: 'title required' });
    if (!start)  return res.status(400).json({ error: 'start required (ISO datetime)' });

    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid start datetime' });
    if (startDate.getTime() < Date.now() - 60000) return res.status(400).json({ error: 'Cannot book in the past' });

    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 3600000);
    if (endDate <= startDate) return res.status(400).json({ error: 'End must be after start' });

    const r = await _getCalendarTenant(phone);
    if (r.error) return res.status(r.code).json({ error: r.error });

    // Conflict detection — query events overlapping the requested slot
    if (!force) {
      const overlap = await tenantCal.getEvents(
        r.tenant.calendar_refresh_token,
        r.tenant.calendar_id,
        startDate.toISOString(),
        endDate.toISOString()
      );
      if (overlap.length > 0) {
        return res.status(409).json({
          error: 'Time slot conflicts with existing event(s)',
          conflicts: overlap.map(e => ({
            id: e.id,
            title: e.summary,
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date
          })),
          hint: 'Pass force=true to book anyway'
        });
      }
    }

    const cleanGuests = Array.isArray(guests)
      ? guests.map(g => String(g).trim().toLowerCase()).filter(g => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g))
      : [];

    const event = await tenantCal.createEvent(r.tenant.calendar_refresh_token, r.tenant.calendar_id, {
      title: String(title).trim().slice(0, 200),
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      description: description ? String(description).slice(0, 1000) : '',
      guests: cleanGuests
    });

    res.json({
      ok: true,
      event: {
        id: event.id,
        title: event.summary,
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        meet_link: event.meetLink || ''
      }
    });
  } catch (e) {
    console.error('[/api/tenant/calendar/book]', e.message);
    res.status(500).json({ error: e.message || 'Booking failed' });
  }
});

// POST /api/tenant/calendar/reschedule
//   Body: { phone, event_id, new_start, new_end? }
app.post('/api/tenant/calendar/reschedule', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    const { event_id, new_start, new_end } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (!event_id) return res.status(400).json({ error: 'event_id required' });
    if (!new_start) return res.status(400).json({ error: 'new_start required' });

    const startDate = new Date(new_start);
    if (isNaN(startDate.getTime())) return res.status(400).json({ error: 'Invalid new_start' });
    if (startDate.getTime() < Date.now() - 60000) return res.status(400).json({ error: 'Cannot reschedule to the past' });

    const endDate = new_end ? new Date(new_end) : new Date(startDate.getTime() + 3600000);

    const r = await _getCalendarTenant(phone);
    if (r.error) return res.status(r.code).json({ error: r.error });

    const updated = await tenantCal.updateEvent(r.tenant.calendar_refresh_token, r.tenant.calendar_id, event_id, {
      start: { dateTime: startDate.toISOString(), timeZone: tenantCal.TIMEZONE },
      end:   { dateTime: endDate.toISOString(),   timeZone: tenantCal.TIMEZONE }
    });

    res.json({
      ok: true,
      event: {
        id: updated.id,
        title: updated.summary,
        start: updated.start?.dateTime,
        end: updated.end?.dateTime
      }
    });
  } catch (e) {
    console.error('[/api/tenant/calendar/reschedule]', e.message);
    res.status(500).json({ error: e.message || 'Reschedule failed' });
  }
});

// POST /api/tenant/calendar/cancel
//   Body: { phone, event_id }
app.post('/api/tenant/calendar/cancel', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    const { event_id } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    if (!event_id) return res.status(400).json({ error: 'event_id required' });

    const r = await _getCalendarTenant(phone);
    if (r.error) return res.status(r.code).json({ error: r.error });

    await tenantCal.deleteEvent(r.tenant.calendar_refresh_token, r.tenant.calendar_id, event_id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/tenant/calendar/cancel]', e.message);
    res.status(500).json({ error: e.message || 'Cancel failed' });
  }
});

// POST /api/tenant/sync-now — manual sync trigger from settings UI
app.post('/api/tenant/sync-now', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant' });

    const tenantSync = require('./helpers/tenant-sync');
    if (typeof tenantSync.clearSyncThrottle === 'function') tenantSync.clearSyncThrottle(tenantId);

    const { data: t } = await supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    if (!t) return res.status(404).json({ error: 'Tenant row missing' });

    // Trigger a single-tenant sync. tenant-sync.js exports syncOneTenant if
    // available, else fall back to syncAllTenants which throttles per-tenant.
    let result;
    if (typeof tenantSync.syncOneTenant === 'function') {
      result = await tenantSync.syncOneTenant(supabase, t, sendWhatsAppReply);
    } else {
      result = await tenantSync.syncAllTenants(supabase, sendWhatsAppReply, { only: tenantId });
    }
    res.json({ ok: true, message: result?.message || 'Synced', detail: result });
  } catch (e) {
    console.error('[/api/tenant/sync-now]', e.message);
    res.status(500).json({ error: e.message || 'Sync failed' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS DRAWER — Phase 22 Sprint 2D
// ════════════════════════════════════════════════════════════════════════════

// Helper: insert a notification — used internally from sync, calendar, etc.
// Exported on global so other modules can call it via app.locals.
async function createNotification({ tenantId, phone, kind, title, message, metadata, severity }) {
  if (!tenantId || !title) return null;
  try {
    const { data, error } = await supabase.from('tenant_notifications').insert({
      tenant_id: tenantId,
      phone: phone || null,
      kind: kind || 'info',
      title: String(title).slice(0, 200),
      message: message ? String(message).slice(0, 1000) : null,
      metadata: metadata || {},
      severity: severity || 'info'
    }).select('id').maybeSingle();
    if (error) { console.warn('[notifications] insert err:', error.message); return null; }
    return data?.id || null;
  } catch (e) { console.warn('[notifications] error:', e.message); return null; }
}
app.locals.createNotification = createNotification;

// GET /api/notifications?phone=...&unread=true&limit=50
app.get('/api/notifications', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.json({ notifications: [], unread_count: 0 });

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const unreadOnly = req.query.unread === 'true' || req.query.unread === '1';

    let q = supabase
      .from('tenant_notifications')
      .select('*')
      .or(`phone.eq.${phone},tenant_id.eq.${tenantId}`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (unreadOnly) q = q.is('read_at', null);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });

    // Unread count (separate query so list filter doesn't affect it)
    const { count: unreadCount } = await supabase
      .from('tenant_notifications')
      .select('id', { count: 'exact', head: true })
      .or(`phone.eq.${phone},tenant_id.eq.${tenantId}`)
      .is('read_at', null);

    res.json({
      notifications: (data || []).map(n => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        message: n.message,
        severity: n.severity || 'info',
        read: !!n.read_at,
        created_at: n.created_at,
        metadata: n.metadata || {}
      })),
      unread_count: unreadCount || 0
    });
  } catch (e) {
    console.error('[/api/notifications]', e.message);
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

// POST /api/notifications/:id/read — mark single notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (!id || !phone) return res.status(400).json({ error: 'id + phone required' });

    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant' });

    const { error } = await supabase
      .from('tenant_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .or(`phone.eq.${phone},tenant_id.eq.${tenantId}`);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/notifications/read]', e.message);
    res.status(500).json({ error: 'Could not mark read' });
  }
});

// POST /api/notifications/mark-all-read
app.post('/api/notifications/mark-all-read', async (req, res) => {
  try {
    const phone = String(req.body.phone || '').replace(/[^0-9]/g, '');
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const tenantId = await resolveTenantIdFromPhone(phone);
    if (!tenantId) return res.status(404).json({ error: 'No tenant' });

    const { error } = await supabase
      .from('tenant_notifications')
      .update({ read_at: new Date().toISOString() })
      .or(`phone.eq.${phone},tenant_id.eq.${tenantId}`)
      .is('read_at', null);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[/api/notifications/mark-all-read]', e.message);
    res.status(500).json({ error: 'Could not mark all read' });
  }
});

// Daily cleanup — drop notifications older than 60 days. Cron-style.
async function cleanupOldNotifications() {
  try {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from('tenant_notifications')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (error) console.warn('[notifications-cleanup]', error.message);
    else if (count) console.log('[notifications-cleanup] deleted', count, 'old rows');
  } catch (e) { console.warn('[notifications-cleanup]', e.message); }
}
setTimeout(cleanupOldNotifications, 90 * 1000);             // 90s warm-up
setInterval(cleanupOldNotifications, 24 * 60 * 60 * 1000); // daily

// Shared phone → tenant_id resolver (mirrors /api/dashboard logic).
async function resolveTenantIdFromPhone(phone, explicitTenantId) {
  if (explicitTenantId) return explicitTenantId;
  // 1. user_databases default
  const { data: defaultDb } = await supabase
    .from('user_databases')
    .select('tenant_id')
    .eq('phone', phone)
    .eq('is_default', true)
    .maybeSingle();
  if (defaultDb?.tenant_id) return defaultDb.tenant_id;
  // 2. tenants.phone
  const { data: t } = await supabase.from('tenants').select('id').eq('phone', phone).maybeSingle();
  if (t?.id) return t.id;
  // 3. tenant_phones mapping
  const { data: m } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', phone).maybeSingle();
  return m?.tenant_id || null;
}

function pickPageOpts(query, page) {
  const opts = {};
  if (query.from)   opts.from   = String(query.from);
  if (query.to)     opts.to     = String(query.to);
  if (query.q)      opts.q      = String(query.q);
  if (query.page)   opts.page   = String(query.page);
  if (query.as_of)  opts.as_of  = String(query.as_of);
  if (query.party)  opts.party  = String(query.party);
  return opts;
}

async function handlePageRequest(req, res, page) {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const explicitTenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;
    if (!phone && !explicitTenantId) {
      return res.status(400).json({ error: 'phone required' });
    }
    const tenantId = await resolveTenantIdFromPhone(phone, explicitTenantId);
    if (!tenantId) return res.status(404).json({ error: 'No tenant found for this phone' });

    const t0 = Date.now();
    const data = await buildPageData(supabase, tenantId, page, pickPageOpts(req.query, page));
    data.elapsed_ms = Date.now() - t0;
    res.json(data);
  } catch (e) {
    console.error(`[PAGE ${page} ERROR]`, e.message);
    res.status(500).json({ error: `${page} page generation failed: ` + e.message });
  }
}

app.get('/api/page/sales',       (req, res) => handlePageRequest(req, res, 'sales'));
app.get('/api/page/outstanding', (req, res) => handlePageRequest(req, res, 'outstanding'));
app.get('/api/page/stock',       (req, res) => handlePageRequest(req, res, 'stock'));
app.get('/api/page/ledger',      (req, res) => handlePageRequest(req, res, 'ledger'));

// ─── Sprint 1.4: Web /chat phone-token HMAC auth gate ────────────────────────
// Token format:  <phoneB64>.<iat>.<exp>.<hexHmac>
// HMAC-SHA256 over `${phoneB64}.${iat}.${exp}` using CHAT_TOKEN_SECRET.
// 24-hour TTL. Issued by /api/auth/issue-token (after phone resolves to a
// real tenant). Verified via verifyChatToken() — used by /chat POST when
// CHAT_AUTH_STRICT=true. When strict mode is off, verification is best-effort
// (logs but doesn't reject) so existing clients keep working during rollout.
const _chatCrypto = require('crypto');
const CHAT_TOKEN_SECRET = process.env.CHAT_TOKEN_SECRET || '';
const CHAT_TOKEN_TTL_SEC = 24 * 60 * 60;
const CHAT_AUTH_STRICT = String(process.env.CHAT_AUTH_STRICT || '').toLowerCase() === 'true';

function _b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function _b64urlDecode(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}
function issueChatToken(phone) {
  if (!CHAT_TOKEN_SECRET) throw new Error('CHAT_TOKEN_SECRET not configured');
  const phoneClean = String(phone || '').replace(/[^0-9]/g, '');
  if (!phoneClean || phoneClean.length < 10 || phoneClean.length > 15) {
    throw new Error('Invalid phone for token issue');
  }
  const phoneB64 = _b64urlEncode(phoneClean);
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + CHAT_TOKEN_TTL_SEC;
  const payload = `${phoneB64}.${iat}.${exp}`;
  const sig = _chatCrypto.createHmac('sha256', CHAT_TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifyChatToken(token) {
  if (!CHAT_TOKEN_SECRET) return { ok: false, error: 'no-secret' };
  if (!token || typeof token !== 'string') return { ok: false, error: 'missing' };
  const parts = token.split('.');
  if (parts.length !== 4) return { ok: false, error: 'malformed' };
  const [phoneB64, iatStr, expStr, sig] = parts;
  const payload = `${phoneB64}.${iatStr}.${expStr}`;
  const expected = _chatCrypto.createHmac('sha256', CHAT_TOKEN_SECRET).update(payload).digest('hex');
  let sigMatch = false;
  try {
    sigMatch = sig.length === expected.length &&
               _chatCrypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) { sigMatch = false; }
  if (!sigMatch) return { ok: false, error: 'bad-signature' };
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: 'expired' };
  }
  let phone;
  try { phone = _b64urlDecode(phoneB64); }
  catch (_) { return { ok: false, error: 'bad-payload' }; }
  if (!/^[0-9]{10,15}$/.test(phone)) return { ok: false, error: 'bad-phone' };
  return { ok: true, phone, exp };
}

// POST /api/auth/issue-token   { phone }  → { token, exp }
// Issues a chat token only after confirming the phone resolves to a known
// tenant (or is a registered MIS user via access_control.json). Light rate
// limit per phone prevents token-mill DoS.
app.post('/api/auth/issue-token', async (req, res) => {
  try {
    const phone = String((req.body && req.body.phone) || '').replace(/[^0-9]/g, '');
    if (!phone || phone.length < 10 || phone.length > 15) {
      return res.status(400).json({ error: 'phone required (10–15 digits)' });
    }
    if (!CHAT_TOKEN_SECRET) {
      return res.status(500).json({ error: 'CHAT_TOKEN_SECRET not configured on server' });
    }
    const rlKey = 'token_issue:' + phone;
    if (rateLimit(rlKey, 5, 60)) {
      res.set('Retry-After', String(rateLimitRetryAfter(rlKey)));
      return res.status(429).json({ error: 'Too many token requests, slow down.' });
    }
    const tenantId = await resolveTenantIdFromPhone(phone, null);
    let knownMisUser = false;
    if (!tenantId) {
      try {
        const ac = (typeof loadAccessControl === 'function') ? loadAccessControl() : null;
        knownMisUser = !!(ac && ac.users && ac.users[phone]);
      } catch (_) { knownMisUser = false; }
    }
    if (!tenantId && !knownMisUser) {
      return res.status(404).json({ error: 'Phone not registered' });
    }
    const token = issueChatToken(phone);
    const v = verifyChatToken(token);
    res.set('Cache-Control', 'no-store');
    res.json({ token, exp: v.exp, ttl_sec: CHAT_TOKEN_TTL_SEC });
  } catch (e) {
    console.error('[/api/auth/issue-token]', e.message);
    res.status(500).json({ error: 'Could not issue token' });
  }
});

// Express middleware for /chat. When CHAT_AUTH_STRICT=true, rejects requests
// without a valid X-Chat-Token whose phone matches body.phone. When strict is
// false (default during rollout), logs mismatches but does not reject — keeps
// existing clients working until login.html starts issuing tokens.
function chatAuthGate(req, res, next) {
  const bodyPhone = String((req.body && req.body.phone) || '').replace(/[^0-9]/g, '');
  const headerToken = req.get('X-Chat-Token') || req.get('x-chat-token') || '';
  const v = verifyChatToken(headerToken);
  if (!v.ok) {
    if (CHAT_AUTH_STRICT) {
      return res.status(401).json({
        reply: '⚠️ Session expired. Please reload and sign in again.',
        type: 'text', auth_error: v.error
      });
    }
    if (headerToken) console.warn('[CHAT AUTH] invalid token:', v.error, 'phone=' + bodyPhone);
    return next();
  }
  if (bodyPhone && v.phone !== bodyPhone) {
    if (CHAT_AUTH_STRICT) {
      return res.status(403).json({
        reply: '⚠️ Token does not match phone. Please reload and sign in again.',
        type: 'text', auth_error: 'phone-mismatch'
      });
    }
    console.warn('[CHAT AUTH] phone mismatch — token:', v.phone, 'body:', bodyPhone);
  }
  req.chatAuth = { phone: v.phone, exp: v.exp };
  next();
}

// ─── Sprint 3C: Spotlight server-side search ─────────────────────────────────
// GET /api/search?phone=...&q=...&limit=20
// Returns { results: [{ kind, label, meta?, link?, score }], elapsed_ms }
//
// Uses pg_trgm similarity + ILIKE substring across the tenant's classified
// sales / purchases tables. Searchable column groups:
//   customer (cols.party in sales)
//   supplier (cols.party in purchases)
//   item     (cols.item  in sales OR purchases)
//   invoice  (cols.id    in sales)
// Each (kind, table, column) runs in parallel via execute_sql RPC. Results are
// merged, deduped by (kind,label), sorted by score desc, capped to `limit`.
function _searchEscSql(s) {
  return String(s == null ? '' : s).replace(/'/g, "''");
}

async function searchTenantData(supabase, tenantId, q, limit) {
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, tables_metadata')
    .eq('id', tenantId)
    .maybeSingle();
  if (tErr || !tenant) return { results: [], error: 'Tenant not found' };

  const tablesMeta = Array.isArray(tenant.tables_metadata) ? tenant.tables_metadata : [];
  const { classifyTable, resolveTableColumns } = dashEngineInternals;

  // Classify tables → roles { sales, purchases, ... }
  const roles = {};
  for (const meta of tablesMeta) {
    const kind = classifyTable(meta);
    if (kind === 'other') continue;
    const cols = resolveTableColumns(meta, kind);
    if (!roles[kind] || (meta.row_count || 0) > (roles[kind].table.row_count || 0)) {
      roles[kind] = { table: meta, cols };
    }
  }

  const queryEsc = _searchEscSql(q);
  const perKindLimit = 6;
  const jobs = [];

  function addJob(kind, table, colMeta, isIdLike = false) {
    if (!table || !colMeta || !colMeta.pg_name) return;
    const tName = table.pg_table;
    const cName = colMeta.pg_name;
    // For invoice numbers (alphanumeric ids) trigram similarity is unreliable;
    // rely on prefix / substring ILIKE only.
    const sql = isIdLike ? `
      SELECT DISTINCT ${cName}::text AS label,
        CASE WHEN ${cName}::text ILIKE '${queryEsc}%' THEN 1.0
             WHEN ${cName}::text ILIKE '%${queryEsc}%' THEN 0.7
             ELSE 0 END AS score
      FROM ${tName}
      WHERE ${cName} IS NOT NULL AND ${cName}::text ILIKE '%${queryEsc}%'
      ORDER BY score DESC
      LIMIT ${perKindLimit * 2}` : `
      SELECT DISTINCT ${cName}::text AS label,
        GREATEST(
          similarity(${cName}::text, '${queryEsc}'),
          CASE WHEN ${cName}::text ILIKE '${queryEsc}%' THEN 0.95
               WHEN ${cName}::text ILIKE '%${queryEsc}%' THEN 0.70
               ELSE 0 END
        ) AS score
      FROM ${tName}
      WHERE ${cName} IS NOT NULL
        AND (${cName}::text ILIKE '%${queryEsc}%' OR ${cName}::text % '${queryEsc}')
      ORDER BY score DESC
      LIMIT ${perKindLimit * 2}`;
    jobs.push({ kind, sql });
  }

  if (roles.sales) {
    addJob('customer', roles.sales.table, roles.sales.cols.party);
    addJob('item',     roles.sales.table, roles.sales.cols.item);
    addJob('invoice',  roles.sales.table, roles.sales.cols.id, true);
  }
  if (roles.purchases) {
    addJob('supplier', roles.purchases.table, roles.purchases.cols.party);
    if (!roles.sales) addJob('item', roles.purchases.table, roles.purchases.cols.item);
  }

  const results = [];
  const seen = new Set();
  await Promise.all(jobs.map(async (j) => {
    try {
      const { data, error } = await supabase.rpc('execute_sql', { query: j.sql });
      if (error || !Array.isArray(data)) return;
      for (const row of data) {
        const label = String(row.label || '').trim();
        if (!label) continue;
        const key = `${j.kind}::${label.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const score = Number(row.score) || 0;
        if (score < 0.18) continue; // similarity threshold
        results.push({ kind: j.kind, label, score: Math.round(score * 100) / 100 });
      }
    } catch (_) { /* swallow per-job error, keep other results */ }
  }));

  // Slight kind-priority boost so customers/suppliers appear above items at equal score
  const KIND_BOOST = { customer: 0.05, supplier: 0.04, invoice: 0.02, item: 0 };
  results.sort((a, b) => {
    const sa = a.score + (KIND_BOOST[a.kind] || 0);
    const sb = b.score + (KIND_BOOST[b.kind] || 0);
    return sb - sa;
  });

  const top = results.slice(0, limit);
  for (const r of top) {
    if (r.kind === 'customer' || r.kind === 'supplier') {
      r.link = `/ledger?q=${encodeURIComponent(r.label)}`;
    } else if (r.kind === 'invoice') {
      r.link = `/sales?q=${encodeURIComponent(r.label)}`;
    } else if (r.kind === 'item') {
      r.link = `/stock`;
    }
  }
  return { results: top };
}

app.get('/api/search', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const explicitTenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;
    const q = String(req.query.q || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

    if (!phone && !explicitTenantId) {
      return res.status(400).json({ error: 'phone required' });
    }
    if (q.length < 2) {
      return res.json({ results: [], message: 'Enter at least 2 characters' });
    }

    const tenantId = await resolveTenantIdFromPhone(phone, explicitTenantId);
    if (!tenantId) return res.status(404).json({ error: 'No tenant found for this phone' });

    const t0 = Date.now();
    const out = await searchTenantData(supabase, tenantId, q, limit);
    out.elapsed_ms = Date.now() - t0;
    res.set('Cache-Control', 'no-store');
    res.json(out);
  } catch (e) {
    console.error('[/api/search]', e.message);
    res.status(500).json({ error: 'Search failed: ' + e.message });
  }
});

// ─── Dynamic reports catalogue ─────────────────────────────────────────────
// GET /api/reports/list?phone=...
// Returns the reports this tenant can run, based on which tables (roles) they
// actually have. Frontend uses this to render only relevant report cards.
const REPORT_CATALOG = [
  { id: 'sales-summary', title: 'Sales Summary', icon: 'trending-up',
    desc: 'Total revenue, invoice count, average ticket, top customers and items for the selected period.',
    source: 'sales', requires: ['sales'] },
  { id: 'top-customers', title: 'Top Customers', icon: 'users',
    desc: 'Top customers by total sales for the selected period.',
    source: 'sales', requires: ['sales'] },
  { id: 'top-items', title: 'Top Items', icon: 'boxes',
    desc: 'Top items by revenue contribution for the selected period.',
    source: 'sales', requires: ['sales'] },
  { id: 'sales-by-city', title: 'Sales by City', icon: 'map-pin',
    desc: 'Geographic split of revenue across cities/locations.',
    source: 'sales', requires: ['sales'], requiresColumn: { role: 'sales', col: 'city' } },
  { id: 'purchase-summary', title: 'Purchase Summary', icon: 'shopping-cart',
    desc: 'Total purchases, supplier count, top suppliers/items for the selected period.',
    source: 'purchases', requires: ['purchases'] },
  { id: 'top-suppliers', title: 'Top Suppliers', icon: 'truck',
    desc: 'Top suppliers by purchase value for the selected period.',
    source: 'purchases', requires: ['purchases'] },
  { id: 'outstanding-aging', title: 'Outstanding Aging', icon: 'hourglass',
    desc: 'Receivables broken into 0-30, 31-60, 61-90, 90+ day buckets with top defaulters.',
    source: 'outstanding', requires: ['purchases'] },
  { id: 'stock-valuation', title: 'Stock Valuation', icon: 'package',
    desc: 'Item-wise inventory value, top SKUs by stock worth, slow-moving alerts.',
    source: 'stock', requires: ['sales', 'purchases'] },
  { id: 'ledger-summary', title: 'Ledger Summary', icon: 'book-open',
    desc: 'Party-wise net balance (sales − purchases) for every counterparty.',
    source: 'ledger', requires: ['sales'] },
  { id: 'expense-summary', title: 'Expense Summary', icon: 'receipt',
    desc: 'Period-wise expenses with category breakdown.',
    source: 'expenses', requires: ['expenses'] }
];

app.get('/api/reports/list', async (req, res) => {
  try {
    const phone = String(req.query.phone || '').replace(/[^0-9]/g, '');
    const explicitTenantId = req.query.tenant_id ? String(req.query.tenant_id) : null;
    if (!phone && !explicitTenantId) {
      return res.status(400).json({ error: 'phone required' });
    }
    const tenantId = await resolveTenantIdFromPhone(phone, explicitTenantId);
    if (!tenantId) return res.status(404).json({ error: 'No tenant found for this phone' });

    const { data: tenant, error: tErr } = await supabase
      .from('tenants').select('id, name, tables_metadata').eq('id', tenantId).maybeSingle();
    if (tErr || !tenant) return res.status(404).json({ error: 'Tenant not found' });

    const tablesMeta = Array.isArray(tenant.tables_metadata) ? tenant.tables_metadata : [];
    const { classifyTable, resolveTableColumns } = dashEngineInternals;

    const roles = {};
    for (const meta of tablesMeta) {
      const kind = classifyTable(meta);
      if (kind === 'other') continue;
      const cols = resolveTableColumns(meta, kind);
      if (!roles[kind] || (meta.row_count || 0) > (roles[kind].table.row_count || 0)) {
        roles[kind] = { table: meta, cols };
      }
    }
    const availableRoleKeys = Object.keys(roles);

    const reports = REPORT_CATALOG.filter(r => {
      for (const req of r.requires) if (!roles[req]) return false;
      if (r.requiresColumn) {
        const role = roles[r.requiresColumn.role];
        if (!role) return false;
        const colKey = r.requiresColumn.col;
        if (!role.cols || !role.cols[colKey] || !role.cols[colKey].pg_name) return false;
      }
      return true;
    }).map(r => ({ id: r.id, title: r.title, desc: r.desc, icon: r.icon, source: r.source }));

    res.set('Cache-Control', 'no-store');
    res.json({
      tenant: { id: tenant.id, name: tenant.name },
      detected_roles: availableRoleKeys,
      reports,
      formats: ['pdf', 'xlsx']
    });
  } catch (e) {
    console.error('[/api/reports/list]', e.message);
    res.status(500).json({ error: 'Could not list reports: ' + e.message });
  }
});

// Detect schema from a Google Sheet URL
app.post('/api/tenant/detect-schema', async (req, res) => {
  try {
    const { sheet_url } = req.body;
    if (!sheet_url) return res.status(400).json({ error: 'sheet_url required' });
    const schema = await detectSheetSchema(sheet_url);
    res.json(schema);
  } catch (e) {
    console.error('[DETECT SCHEMA ERROR]', e.message);
    res.status(400).json({ error: e.message });
  }
});

// Register new tenant OR add sheet to existing tenant
// ════════════════════════════════════════════════════════════════════════════
// PUBLIC SELF-SERVICE SIGNUP (no admin auth)
// Brand-new users register themselves directly from the web onboarding UI.
// Defenses against abuse:
//   • IP rate limit:   3 signups / hour
//   • Phone rate limit: 2 attempts / hour for the same phone (prevents spam/typos)
//   • Strict input validation: phone 10-15 digits, name 1-100 chars, sheet URL must be Google Sheets
//   • Duplicate phone → 409
//   • Strips HTML, caps lengths
//   • Sync runs in background (response returns fast)
// ════════════════════════════════════════════════════════════════════════════
app.post('/api/tenant/signup', async (req, res) => {
  try {
    const ip = clientIp(req);
    if (rateLimit('signup_ip:' + ip, 3, 3600)) {
      return res.status(429).json({ error: 'Too many signup attempts. Try again in an hour.' });
    }

    const { name, phone, sheet_url, business_description, schema, email } = req.body || {};
    const sanitize = s => String(s || '').replace(/[<>]/g, '').trim();

    // Phone validation
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '').slice(0, 15);
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      return res.status(400).json({ error: 'Valid phone number required (10-15 digits with country code)' });
    }
    if (rateLimit('signup_phone:' + cleanPhone, 2, 3600)) {
      return res.status(429).json({ error: 'Too many attempts for this number. Try in an hour.' });
    }

    // Name validation
    const cleanName = sanitize(name).slice(0, 100);
    if (cleanName.length < 2) return res.status(400).json({ error: 'Business name required (min 2 chars)' });

    // Email validation (optional but if present must be valid)
    const cleanEmail = sanitize(email).slice(0, 254).toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Sheet URL validation
    if (sheet_url && typeof sheet_url === 'string') {
      if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(sheet_url)) {
        return res.status(400).json({ error: 'Sheet URL must be a Google Sheets link' });
      }
      if (sheet_url.length > 500) return res.status(400).json({ error: 'Sheet URL too long' });
    }

    // Description validation
    const cleanDesc = sanitize(business_description).slice(0, 500);

    // Duplicate phone check (against tenants + tenant_phones)
    const { data: existingT } = await supabase.from('tenants').select('id,name').eq('phone', cleanPhone).maybeSingle();
    const { data: existingP } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', cleanPhone).maybeSingle();

    // ─── ADD-TO-EXISTING MODE ───────────────────────────────────────────
    // Accept add_to_existing only when the requested tenant_id is owned by
    // the same phone (phone is the de-facto auth token here). This avoids
    // leaking admin API key in the frontend.
    const { add_to_existing, tenant_id: requestedTenantId } = req.body || {};
    if (add_to_existing) {
      if (!requestedTenantId) return res.status(400).json({ error: 'tenant_id required for add_to_existing' });
      const ownerOk = (existingT && existingT.id === requestedTenantId) || (existingP && existingP.tenant_id === requestedTenantId);
      if (!ownerOk) return res.status(403).json({ error: 'Phone does not own this tenant' });

      // Schema must be present (it's the new sheet)
      if (!schema || typeof schema !== 'object') return res.status(400).json({ error: 'New sheet schema required' });
      if (JSON.stringify(schema).length > 500_000) return res.status(400).json({ error: 'Schema too large' });
      if (sheet_url && !/^https:\/\/docs\.google\.com\/spreadsheets\//.test(sheet_url)) {
        return res.status(400).json({ error: 'Sheet URL must be a Google Sheets link' });
      }

      const { data: existing } = await supabase.from('tenants').select('*').eq('id', requestedTenantId).single();
      if (!existing) return res.status(404).json({ error: 'Tenant not found' });

      // Merge schema tabs
      const oldSchema = existing.schema_json || { tables: [] };
      const newTables = schema.tables || [];
      const mergedTables = [...(oldSchema.tables || [])];
      for (const nt of newTables) {
        const idx = mergedTables.findIndex(t => t.name === nt.name);
        if (idx >= 0) mergedTables[idx] = nt;
        else mergedTables.push(nt);
      }
      const mergedSchema = { tables: mergedTables, total_rows: mergedTables.reduce((s, t) => s + (t.row_count || 0), 0) };

      const updates = {
        schema_json: mergedSchema,
        sheet_url: sheet_url || existing.sheet_url,
        sheet_id: sheet_url ? extractSheetId(sheet_url) : existing.sheet_id,
        business_description: cleanDesc || existing.business_description,
        system_prompt: generateSystemPrompt({ name: existing.name, business_description: cleanDesc || existing.business_description, schema_json: mergedSchema }),
        updated_at: new Date().toISOString()
      };
      await supabase.from('tenants').update(updates).eq('id', requestedTenantId);
      invalidateTenantCache(cleanPhone);
      await supabase.from('user_databases').upsert({ phone: cleanPhone, tenant_id: requestedTenantId, alias: existing.name, is_default: false }, { onConflict: 'phone,tenant_id' }).then(()=>{},()=>{});

      if (sheet_url) {
        syncSheetToProperTables(supabase, requestedTenantId, sheet_url)
          .then(r => console.log(`[SIGNUP ADD] ${existing.name}: +${r.synced_rows} rows`))
          .catch(e => console.error('[SIGNUP ADD ERROR]', e.message));
      }
      console.log(`[SIGNUP] add-to-existing: ${existing.name} (+${cleanPhone}) from ip ${ip}`);
      return res.json({ success: true, tenant_id: requestedTenantId, name: existing.name, mode: 'added_to_existing', message: 'New sheet added! Sync is running in the background.' });
    }

    // ─── NEW SIGNUP MODE ────────────────────────────────────────────────
    // Detect if this phone already owns one or more tenants. If yes and the
    // caller hasn't picked a mode, return 200 with the list so the frontend
    // can show a choice UI: "Add new tabs to <existing>" vs "Create new separate DB".
    const requestedMode = (req.body || {}).mode; // 'new_separate' | undefined

    // Collect all tenants owned by this phone (via tenants.phone OR tenant_phones)
    const ownedIds = new Set();
    if (existingT) ownedIds.add(existingT.id);
    if (existingP && existingP.tenant_id) ownedIds.add(existingP.tenant_id);
    // Also pull from user_databases (broader source of truth)
    const { data: userDbs } = await supabase
      .from('user_databases')
      .select('tenant_id, alias, is_default')
      .eq('phone', cleanPhone);
    (userDbs || []).forEach(d => ownedIds.add(d.tenant_id));

    if (ownedIds.size > 0 && requestedMode !== 'new_separate') {
      // First contact: tell client about existing DBs and let user choose.
      const { data: list } = await supabase
        .from('tenants')
        .select('id, name')
        .in('id', Array.from(ownedIds));
      return res.json({
        requires_choice: true,
        message: `You already own ${(list || []).length} database(s). Would you like to create a new separate one or add to an existing one?`,
        existing: (list || []).map(t => ({ id: t.id, name: t.name }))
      });
    }
    // Else: requested 'new_separate' OR brand-new phone. Continue creating tenant.
    // NOTE: tenants.phone has UNIQUE constraint until migration 007 is applied.
    // Until then, requestedMode='new_separate' on an existing phone will fail
    // at the DB level with a clear error (frontend handles).

    // Schema validation (optional but if present, must be sane)
    if (schema && typeof schema !== 'object') return res.status(400).json({ error: 'Invalid schema' });
    if (schema && JSON.stringify(schema).length > 500_000) return res.status(400).json({ error: 'Schema too large' });

    // Build tenant record
    const sheetId = sheet_url ? extractSheetId(sheet_url) : null;
    const tenantData = {
      name: cleanName,
      phone: cleanPhone,
      email: cleanEmail || null,
      sheet_url: sheet_url || null,
      sheet_id: sheetId,
      business_description: cleanDesc,
      schema_json: schema || null
    };
    tenantData.system_prompt = generateSystemPrompt({ ...tenantData, schema_json: schema });

    const { data: tenant, error } = await supabase.from('tenants').insert(tenantData).select().single();
    if (error) {
      console.error('[SIGNUP DB ERROR]', error.message);
      // Friendly message when UNIQUE constraint blocks new-separate-with-same-phone
      if (/duplicate key|tenants_phone_key|unique constraint/i.test(error.message)) {
        return res.status(409).json({
          error: 'To create a separate new DB, the admin must apply a one-line SQL migration (007). Until then, please use "Add to existing".',
          migration_required: true
        });
      }
      return res.status(500).json({ error: 'Registration failed. Try again.' });
    }

    // Link phone + default DB
    await supabase.from('tenant_phones').insert({ tenant_id: tenant.id, phone: tenant.phone, role: 'owner' }).then(()=>{},()=>{});
    await supabase.from('user_databases').insert({ phone: tenant.phone, tenant_id: tenant.id, alias: tenant.name, is_default: true }).then(()=>{},()=>{});

    // Background sync — don't block the response
    if (sheet_url) {
      syncSheetToProperTables(supabase, tenant.id, sheet_url)
        .then(r => {
          console.log(`[SIGNUP SYNC] ${tenant.name} (+${tenant.phone}): ${r.synced_rows} rows across ${r.tabs.length} tables`);
        })
        .catch(e => {
          console.error(`[SIGNUP SYNC ERROR] ${tenant.name}:`, e.message);
        });
    }

    console.log(`[SIGNUP] new tenant: ${tenant.name} (+${tenant.phone}) from ip ${ip}`);
    res.json({
      success: true,
      tenant_id: tenant.id,
      name: tenant.name,
      phone: tenant.phone,
      sync_in_background: !!sheet_url,
      message: sheet_url
        ? 'Registration complete! Sheet is syncing in the background (1-2 minutes). Head over to the chat tab to start asking questions.'
        : 'Registration complete! Head over to the chat tab to start.'
    });
  } catch (e) {
    console.error('[SIGNUP ERROR]', e.message);
    res.status(500).json({ error: 'Signup failed: ' + e.message });
  }
});

app.post('/api/tenant/register', requireAuth, async (req, res) => {
  try {
    const { name, phone, sheet_url, business_description, schema, add_to_existing, tenant_id } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const sanitize = s => String(s || '').replace(/[<>]/g, '').slice(0, 500);
    const cleanPhone = phone.replace(/[^0-9]/g, '').slice(0, 15);
    if (cleanPhone.length < 10) return res.status(400).json({ error: 'Valid phone number required (min 10 digits)' });

    // MODE: Add new sheet to existing tenant
    if (add_to_existing && tenant_id) {
      const { data: existing } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
      if (!existing) return res.status(404).json({ error: 'Tenant not found' });

      // Merge new schema tables into existing
      const oldSchema = existing.schema_json || { tables: [] };
      const newTables = schema?.tables || [];
      const mergedTables = [...(oldSchema.tables || [])];
      for (const nt of newTables) {
        const idx = mergedTables.findIndex(t => t.name === nt.name);
        if (idx >= 0) mergedTables[idx] = nt; // replace existing tab
        else mergedTables.push(nt);
      }
      const mergedSchema = { tables: mergedTables, total_rows: mergedTables.reduce((s, t) => s + (t.row_count || 0), 0) };

      const updates = {
        schema_json: mergedSchema,
        sheet_url: sheet_url || existing.sheet_url,
        sheet_id: sheet_url ? extractSheetId(sheet_url) : existing.sheet_id,
        business_description: business_description ? sanitize(business_description) : existing.business_description,
        system_prompt: generateSystemPrompt({ name: existing.name, business_description: business_description || existing.business_description, schema_json: mergedSchema }),
        updated_at: new Date().toISOString()
      };
      await supabase.from('tenants').update(updates).eq('id', tenant_id);
      invalidateTenantCache(cleanPhone);
      // Ensure user_databases entry exists
      await supabase.from('user_databases').upsert({ phone: cleanPhone, tenant_id, alias: existing.name, is_default: false }, { onConflict: 'phone,tenant_id' }).then(()=>{},()=>{});

      // Sync new sheet data (Phase 6: proper tables)
      if (sheet_url) {
        syncSheetToProperTables(supabase, tenant_id, sheet_url)
          .then(r => {
            console.log(`[TENANT ADD P6] ${existing.name}: +${r.synced_rows} rows across ${r.tabs.length} tables`);
            const tabList = (r.tabs || []).map(t => `• ${t.name}: ${t.rows} rows`).join('\n');
            sendWhatsAppReply(cleanPhone, `✅ *New Sheet Added!*\n\n📊 Rows: ${r.synced_rows}\n${tabList}\n\nYou can now ask questions about the new data!`).catch(() => {});
          })
          .catch(e => {
            console.error('[TENANT ADD P6 ERROR]', e.message);
            sendWhatsAppReply(cleanPhone, `⚠️ Sync error: ${e.message}`).catch(() => {});
          });
      }
      return res.json({ success: true, tenant_id, mode: 'added_to_existing' });
    }

    // MODE: Create new tenant
    if (!name) return res.status(400).json({ error: 'name required for new registration' });
    const sheetId = sheet_url ? extractSheetId(sheet_url) : null;

    const tenantData = {
      name: sanitize(name), phone: cleanPhone,
      sheet_url: sheet_url ? String(sheet_url).slice(0, 500) : null, sheet_id: sheetId,
      business_description: sanitize(business_description),
      schema_json: schema || null
    };
    tenantData.system_prompt = generateSystemPrompt({ ...tenantData, schema_json: schema });

    const { data: tenant, error } = await supabase.from('tenants').insert(tenantData).select().single();
    if (error) throw new Error(error.message);

    await supabase.from('tenant_phones').insert({ tenant_id: tenant.id, phone: tenant.phone, role: 'owner' });
    await supabase.from('user_databases').insert({ phone: tenant.phone, tenant_id: tenant.id, alias: tenant.name, is_default: true }).then(()=>{},()=>{});

    if (sheet_url) {
      syncSheetToProperTables(supabase, tenant.id, sheet_url)
        .then(r => {
          console.log(`[TENANT SYNC P6] ${tenant.name}: ${r.synced_rows} rows across ${r.tabs.length} tables`);
          const tabList = (r.tabs || []).map(t => `• ${t.name}: ${t.rows} rows`).join('\n');
          const msg = `✅ *Sheet Sync Complete!*\n\n📊 Total Rows: ${r.synced_rows}\n${tabList}\n\nYou can now ask about your data on WhatsApp! Try:\n• "What is the total amount?"\n• "Show top 5 parties"`;
          sendWhatsAppReply(tenant.phone, msg).catch(() => {});
        })
        .catch(e => {
          console.error(`[TENANT SYNC P6 ERROR] ${tenant.name}:`, e.message);
          sendWhatsAppReply(tenant.phone, `⚠️ Sheet sync error: ${e.message}`).catch(() => {});
        });
    }

    res.json({ success: true, tenant_id: tenant.id, name: tenant.name, mode: 'new' });
  } catch (e) {
    console.error('[REGISTER ERROR]', e.message);
    res.status(400).json({ error: e.message });
  }
});

// Update tenant config (prompt, description, sheet)
app.post('/api/tenant/update', requireAuth, async (req, res) => {
  try {
    const { tenant_id, business_description, sheet_url } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    const updates = { updated_at: new Date().toISOString() };
    if (business_description) updates.business_description = business_description;
    if (sheet_url) {
      updates.sheet_url = sheet_url;
      updates.sheet_id = extractSheetId(sheet_url);
      // Re-detect schema
      const schema = await detectSheetSchema(sheet_url);
      updates.schema_json = schema;
      updates.system_prompt = generateSystemPrompt({ name: '', business_description, schema_json: schema });
      // Re-sync data (Phase 6: proper tables)
      syncSheetToProperTables(supabase, tenant_id, sheet_url).then(r => {
        console.log('[RESYNC P6]', r.synced_rows, 'rows across', r.tabs.length, 'tables');
      }).then(null, e => console.error('[RESYNC P6]', e.message));
    }
    if (business_description && !sheet_url) {
      const { data: t } = await supabase.from('tenants').select('schema_json,name').eq('id', tenant_id).single();
      updates.system_prompt = generateSystemPrompt({ name: t?.name, business_description, schema_json: t?.schema_json });
    }

    await supabase.from('tenants').update(updates).eq('id', tenant_id);
    invalidateTenantCache(req.body.phone || '');
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Migrate an existing tenant from JSONB → proper tables (Phase 6)
// Body: { tenant_id }
// Will create real tables, populate from sheet (full re-sync), and flip proper_tables_created flag.
app.post('/api/tenant/migrate-to-tables', requireAuth, async (req, res) => {
  try {
    const { tenant_id } = req.body;
    if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

    const { data: tenant, error } = await supabase.from('tenants').select('*').eq('id', tenant_id).single();
    if (error || !tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.sheet_url) return res.status(400).json({ error: 'Tenant has no sheet_url; cannot re-sync' });

    console.log(`[MIGRATE P6] Starting for ${tenant.name} (${tenant_id})`);
    const result = await syncSheetToProperTables(supabase, tenant_id, tenant.sheet_url);
    invalidateTenantCache(tenant.phone);
    console.log(`[MIGRATE P6] Done: ${result.synced_rows} rows across ${result.tabs.length} tables`);
    res.json({ success: true, ...result });
  } catch (e) {
    console.error('[MIGRATE P6 ERROR]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── TENANT CALENDAR OAuth ─────────────────────────────────────────────────
const tenantCal = require('./helpers/tenant-calendar');

// Start OAuth flow — redirect tenant to Google consent
app.get('/api/tenant/calendar/auth', (req, res) => {
  const tenantId = req.query.tenant_id;
  if (!tenantId) return res.status(400).send('tenant_id required');
  const url = tenantCal.getAuthURL(tenantId);
  res.redirect(url);
});

// OAuth callback — exchange code for tokens, store refresh_token
app.get('/api/tenant/calendar/callback', async (req, res) => {
  try {
    const { code, state: tenantId } = req.query;
    if (!code || !tenantId) return res.status(400).send('Missing code or tenant_id');

    const tokens = await tenantCal.exchangeCode(code);
    if (!tokens.refresh_token) return res.status(400).send('No refresh token received. Try revoking access and reconnecting.');

    const calendarId = 'primary';

    // Store in tenants table
    await supabase.from('tenants').update({
      calendar_id: calendarId,
      calendar_refresh_token: tokens.refresh_token,
      calendar_connected: true
    }).eq('id', tenantId);

    // Invalidate cache for ALL phones owning this tenant so the next chat
    // message picks up calendar_connected=true without needing a tab reload.
    try {
      const { data: ownerRow } = await supabase.from('tenants').select('phone').eq('id', tenantId).single();
      if (ownerRow?.phone) invalidateTenantCache(ownerRow.phone);
      const { data: phoneRows } = await supabase.from('tenant_phones').select('phone').eq('tenant_id', tenantId);
      (phoneRows || []).forEach(p => p.phone && invalidateTenantCache(p.phone));
      const { data: udRows } = await supabase.from('user_databases').select('phone').eq('tenant_id', tenantId);
      (udRows || []).forEach(u => u.phone && invalidateTenantCache(u.phone));
    } catch (e) {
      console.error('[OAUTH CACHE INVALIDATE]', e.message);
    }

    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0a0a0a;color:#e5e5e5">
      <h1 style="color:#22c55e">✅ Calendar Connected!</h1>
      <p>You can now book meetings via WhatsApp or web chat — just say "book a meeting".</p>
      <p style="color:#666;margin-top:40px">You can close this tab — go back to chat and try directly, no reload needed.</p>
    </body></html>`);
  } catch (e) {
    console.error('[CALENDAR OAUTH ERROR]', e.message);
    res.status(500).send('Calendar connection failed: ' + e.message);
  }
});

// ── ERROR HANDLER (prevent stack trace leaks) ─────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error('[UNHANDLED ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`MIS Chatbot running at http://localhost:${PORT}`);
  await fetchLiveSchema();
});

process.on("unhandledRejection", r => console.error("[UNHANDLED]", r));
process.on("uncaughtException", e => { console.error("[UNCAUGHT]", e); /* keep running */ });