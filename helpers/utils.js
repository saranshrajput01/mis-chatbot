const fs = require("fs");
const path = require("path");

// ── RATE LIMITING ──────────────────────────────────────────────────────────
const rateLimits = new Map();
function rateLimit(key, maxRequests = 20, windowSec = 60) {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return false;
  }
  entry.count++;
  if (entry.count > maxRequests) return true;
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits) { if (now > v.resetAt) rateLimits.delete(k); }
}, 300000);

// ── ACCESS CONTROL ─────────────────────────────────────────────────────────
function loadAccessControl() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "access_control.json"), "utf8")); }
  catch(e) { return { mode: "ALL", allowed_numbers: [], users: {} }; }
}
function checkAccess(phone) {
  const ac = loadAccessControl();
  const user = ac.users[phone];
  if (ac.mode === "LIST") {
    if (!user && !ac.allowed_numbers.includes(phone)) return { allowed: false };
  }
  return { allowed: true, mode: user?.access || ac.mode, name: user?.name || "" };
}

// ── SESSIONS ───────────────────────────────────────────────────────────────
let wpSessions = {};
async function loadSessionsFromDB(supabase) {
  try {
    const { data } = await supabase.from("wp_sessions").select("phone,data");
    if (data) data.forEach(r => { wpSessions[r.phone] = r.data; });
    console.log("[SESSIONS] Loaded", Object.keys(wpSessions).length, "from Supabase");
  } catch(e) { console.error("[SESSIONS] Load error:", e.message); }
}
function saveSession(phone, supabase) {
  const val = wpSessions[phone];
  if (val) supabase.from("wp_sessions").upsert({ phone, data: val, updated_at: new Date().toISOString() }).then(() => {});
  else supabase.from("wp_sessions").delete().eq("phone", phone).then(() => {});
}
function getSession(phone) { return wpSessions[phone]; }
function setSession(phone, val) { wpSessions[phone] = val; }
function deleteSession(phone) { delete wpSessions[phone]; }

// ── MESSAGE LOGGING ───────────────────────────────────────────────────────
function logMessage(supabase, platform, direction, message, { phone, session_id, message_type } = {}) {
  supabase.from("message_logs").insert({ platform, direction, message: (message||"").slice(0, 5000), phone, session_id, message_type: message_type || "text" }).then(() => {});
}

// ── QUERY CACHE (5 min TTL) ───────────────────────────────────────────────
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
function getCached(key) { const e = queryCache.get(key); if (!e) return null; if (Date.now() - e.ts > CACHE_TTL) { queryCache.delete(key); return null; } return e.val; }
function setCache(key, val) { queryCache.set(key, { val, ts: Date.now() }); if (queryCache.size > 200) { const first = queryCache.keys().next().value; queryCache.delete(first); } }

// ── FORMATTERS ────────────────────────────────────────────────────────────
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

module.exports = {
  rateLimit, loadAccessControl, checkAccess,
  wpSessions, loadSessionsFromDB, saveSession, getSession, setSession, deleteSession,
  logMessage, getCached, setCache,
  fmtAmt, fmtDate, fmtMonth
};
