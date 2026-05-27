/**
 * Self-Heal — Phase 10
 *
 * One module, six layers — all designed to make the chatbot auto-recover
 * from common failures WITHOUT human intervention:
 *
 *   classifyError        — TRANSIENT vs SCHEMA vs USER vs PERMANENT
 *   withRetry            — generic retry with exponential backoff (transient only)
 *   resolveColumnError   — AI used wrong column → Levenshtein-suggest closest, rewrite SQL
 *   detectSchemaDrift    — diff sheet headers vs existing PG columns (added / removed / type-drift)
 *   relaxSQL             — on 0 rows, drop date / loosen ILIKE / drop LIMIT — try simpler variants
 *   validateResult       — detect single-row-all-NULL aggregates, suspicious empties
 *   pingDb               — round-trip the DB; used by /health and as connection guard
 *
 * Every helper is pure / side-effect-free except `pingDb` (one DB call) and
 * `withRetry` (calls the wrapped fn). Callers control where in their flow
 * each layer fires.
 */

'use strict';

// ════════════════════════════════════════════════════════════════════════
// 10.6 — ERROR CLASSIFICATION
// ════════════════════════════════════════════════════════════════════════

/**
 * Categorize an error so callers know whether to retry, rewrite, or fail.
 *
 * Returns:
 *   {
 *     kind: 'TRANSIENT' | 'SCHEMA_COLUMN' | 'SCHEMA_RELATION' | 'SQL_SYNTAX'
 *           | 'PERMISSION' | 'TIMEOUT' | 'RATE_LIMIT' | 'PERMANENT' | 'UNKNOWN',
 *     retryable: boolean,
 *     friendly:  string  // user-facing English message
 *   }
 */
function classifyError(err) {
  if (!err) return { kind: 'UNKNOWN', retryable: false, friendly: 'Something went wrong.' };

  const msg = String(err.message || err.toString() || '').toLowerCase();
  const code = String(err.code || '').toLowerCase();

  // ── TRANSIENT (network) — auto-retry safely ──
  if (
    /econnreset|etimedout|enotfound|enetunreach|socket hang up|fetch failed|connection (terminated|refused|reset)|network (error|request failed)|abortError/i.test(msg) ||
    ['econnreset', 'etimedout', 'enotfound', 'enetunreach', 'eai_again', 'epipe'].includes(code)
  ) {
    return { kind: 'TRANSIENT', retryable: true, friendly: 'Minor network issue — retrying...' };
  }

  // ── TIMEOUT — retry once ──
  if (/timeout|timed out|deadline exceeded/i.test(msg)) {
    return { kind: 'TIMEOUT', retryable: true, friendly: 'Server is slow — retrying...' };
  }

  // ── RATE LIMIT — retry with longer delay ──
  if (/rate limit|too many requests|429|quota/i.test(msg)) {
    return { kind: 'RATE_LIMIT', retryable: true, friendly: 'Hit a rate limit — retrying shortly...' };
  }

  // ── SCHEMA: column doesn't exist — fixable via column resolver ──
  if (/column .* does not exist|column ".+" of relation/i.test(msg)) {
    return { kind: 'SCHEMA_COLUMN', retryable: true, friendly: 'Column name was wrong — fixing and retrying...' };
  }

  // ── SCHEMA: relation/table doesn't exist — could be stale metadata ──
  if (/relation .* does not exist|table .* does not exist/i.test(msg)) {
    return { kind: 'SCHEMA_RELATION', retryable: false, friendly: 'Table not found. Please re-sync the sheet.' };
  }

  // ── PERMISSION (RLS, role) — never retry ──
  if (/permission denied|insufficient privilege|rls|access denied/i.test(msg)) {
    return { kind: 'PERMISSION', retryable: false, friendly: 'Permission issue — please contact admin.' };
  }

  // ── SQL SYNTAX — fixable by AI re-prompt ──
  if (/syntax error|invalid input syntax|operator does not exist|aggregate.*invalid|group by/i.test(msg)) {
    return { kind: 'SQL_SYNTAX', retryable: true, friendly: 'Query was a bit off — retrying...' };
  }

  // ── DIVISION BY ZERO / RANGE — fixable ──
  if (/division by zero|out of range|numeric overflow|invalid input/i.test(msg)) {
    return { kind: 'PERMANENT', retryable: false, friendly: 'Calculation error.' };
  }

  return { kind: 'UNKNOWN', retryable: false, friendly: 'Something went wrong — please try again.' };
}

// ════════════════════════════════════════════════════════════════════════
// 10.5 — GENERIC RETRY WITH EXPONENTIAL BACKOFF
// ════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Run `fn` with auto-retry on TRANSIENT / TIMEOUT / RATE_LIMIT errors only.
 * SCHEMA / SQL / USER errors propagate immediately so callers can handle them.
 *
 * Backoff: baseDelayMs * 2^(attempt-1)  (e.g. 250 → 500 → 1000)
 *
 * @param {Function} fn            async () => result
 * @param {object}   opts
 * @param {number}   opts.maxAttempts   default 3
 * @param {number}   opts.baseDelayMs   default 250
 * @param {Function} opts.onRetry       (err, attempt) => void
 * @param {string}   opts.label         debug label for logs
 */
async function withRetry(fn, opts = {}) {
  const max = opts.maxAttempts || 3;
  const base = opts.baseDelayMs || 250;
  const label = opts.label || 'op';
  let lastErr = null;

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const cls = classifyError(err);

      if (!cls.retryable || attempt >= max) throw err;

      const delay = base * Math.pow(2, attempt - 1);
      console.log(`[SELF-HEAL] ${label} attempt ${attempt}/${max} failed (${cls.kind}: ${err.message?.slice(0, 80)}) — retrying in ${delay}ms`);
      if (typeof opts.onRetry === 'function') {
        try { opts.onRetry(err, attempt); } catch (_) {}
      }
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════════════
// 10.1 — FUZZY COLUMN NAME RESOLUTION
// ════════════════════════════════════════════════════════════════════════

/**
 * Compute Levenshtein distance between two strings (lowercased).
 * Iterative DP — O(m*n) time, O(min(m,n)) memory.
 */
function levenshtein(a, b) {
  a = String(a || '').toLowerCase();
  b = String(b || '').toLowerCase();
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  // Use the shorter string for the inner loop
  if (a.length > b.length) { const t = a; a = b; b = t; }

  let prev = new Array(a.length + 1);
  let curr = new Array(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,        // insertion
        prev[i] + 1,            // deletion
        prev[i - 1] + cost      // substitution
      );
    }
    const t = prev; prev = curr; curr = t;
  }
  return prev[a.length];
}

/**
 * Find closest match from a list of candidate column names.
 * Substring boost: if `bad` is contained in `candidate` (or vice-versa),
 * subtract a virtual distance so token-overlap wins over pure spelling.
 *
 * @returns {{name: string, distance: number, score: number} | null}
 */
function findClosestColumn(bad, candidates) {
  if (!bad || !candidates?.length) return null;
  const badLower = String(bad).toLowerCase();
  let best = null;

  for (const cand of candidates) {
    const candLower = String(cand).toLowerCase();
    let dist = levenshtein(badLower, candLower);

    // Substring boost — "amount" inside "with_gst_amount" should beat "amt"
    if (candLower.includes(badLower) || badLower.includes(candLower)) {
      dist = Math.max(0, dist - Math.min(badLower.length, candLower.length) / 2);
    }

    // Token-prefix boost — "qty" matches "quantity"
    if (candLower.startsWith(badLower) || badLower.startsWith(candLower)) {
      dist = Math.max(0, dist - 1);
    }

    const maxLen = Math.max(badLower.length, candLower.length);
    const score = maxLen ? 1 - dist / maxLen : 0;

    if (!best || dist < best.distance) {
      best = { name: cand, distance: dist, score };
    }
  }
  return best;
}

/**
 * Parse a Postgres "column does not exist" error and try to rewrite the SQL
 * by substituting the closest column name from `knownColumns`.
 *
 * Postgres error format examples:
 *   - column "total_price" does not exist
 *   - column "t.amount_total" does not exist
 *   - ERROR: column reference "amount" is ambiguous
 *
 * @param {string}   errorMsg       raw error message
 * @param {string}   sql            the failed SQL
 * @param {string[]} knownColumns   real column names from tablesMetadata
 * @param {object}   opts
 * @param {number}   opts.minScore  default 0.5 — reject low-confidence matches
 * @returns {{rewrittenSQL: string, badCol: string, goodCol: string, score: number} | null}
 */
function resolveColumnError(errorMsg, sql, knownColumns, opts = {}) {
  if (!errorMsg || !sql || !knownColumns?.length) return null;
  const minScore = opts.minScore ?? 0.5;

  const m = String(errorMsg).match(/column "?([a-zA-Z_][\w.]*)"? (?:does not exist|of relation)/i);
  if (!m) return null;

  // Strip table prefix if present ("t.amount" → "amount")
  let badCol = m[1];
  if (badCol.includes('.')) badCol = badCol.split('.').pop();

  // Already valid? Then this isn't a typo — bail.
  const knownLower = knownColumns.map(c => c.toLowerCase());
  if (knownLower.includes(badCol.toLowerCase())) return null;

  const match = findClosestColumn(badCol, knownColumns);
  if (!match || match.score < minScore) return null;

  // Replace `badCol` in the SQL with `match.name` — preserve quoted/unquoted forms,
  // but only as a whole word (so we don't replace partial matches inside other names).
  const escaped = badCol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  const rewrittenSQL = sql.replace(re, match.name);

  // If the replacement didn't actually change anything, give up.
  if (rewrittenSQL === sql) return null;

  return { rewrittenSQL, badCol, goodCol: match.name, score: match.score };
}

/**
 * Build a flat list of all known PG column names from tablesMetadata.
 * Used by `resolveColumnError` for tenant flow.
 */
function flattenColumnNames(tablesMetadata) {
  if (!tablesMetadata?.length) return [];
  const out = new Set();
  for (const t of tablesMetadata) {
    for (const c of (t.columns || [])) {
      if (c.pg_name) out.add(c.pg_name);
    }
  }
  return [...out];
}

// ════════════════════════════════════════════════════════════════════════
// 10.2 — SCHEMA DRIFT DETECTION
// ════════════════════════════════════════════════════════════════════════

/**
 * Compare the columns we just built from the live sheet against what's
 * actually in the Postgres table right now. Tells the caller exactly
 * what changed so we can ALTER / log / re-detect roles.
 *
 * @param {string[]} pgColumns      lowercased real columns from information_schema
 * @param {object[]} sheetColumns   buildColumnMetadata(...) output
 * @param {object[]} previousMeta   optional: tables_metadata snapshot from last sync
 *                                   (so we can spot type-drift even if PG type unchanged)
 *
 * @returns {{
 *   added:        Array<{name, type, role}>,
 *   removed:      string[],
 *   typeChanged:  Array<{name, from, to}>,    // role/type drift since last sync
 *   total:        number,                      // sheet column count
 *   summary:      string                       // one-line log summary
 * }}
 */
function detectSchemaDrift(pgColumns, sheetColumns, previousMeta) {
  const pgLower = new Set((pgColumns || []).map(c => String(c).toLowerCase()));
  const sheetLower = new Set((sheetColumns || []).map(c => c.pg_name.toLowerCase()));

  // System columns that are always present — never count as removed
  const systemCols = new Set(['id', 'created_at', 'updated_at', '_row_id']);

  const added = [];
  const removed = [];
  const typeChanged = [];

  for (const c of sheetColumns) {
    if (!pgLower.has(c.pg_name.toLowerCase())) {
      added.push({ name: c.pg_name, type: c.pg_type, role: c.role });
    }
  }

  for (const pgCol of pgColumns) {
    const lower = String(pgCol).toLowerCase();
    if (systemCols.has(lower)) continue;
    if (!sheetLower.has(lower)) {
      removed.push(pgCol);
    }
  }

  // Type drift detection — compare against previous metadata snapshot
  if (previousMeta?.length) {
    const prevByName = new Map();
    for (const c of previousMeta) prevByName.set(c.pg_name.toLowerCase(), c);
    for (const c of sheetColumns) {
      const prev = prevByName.get(c.pg_name.toLowerCase());
      if (prev && (prev.pg_type !== c.pg_type || prev.role !== c.role)) {
        typeChanged.push({
          name: c.pg_name,
          from: `${prev.pg_type}/${prev.role}`,
          to: `${c.pg_type}/${c.role}`,
        });
      }
    }
  }

  const parts = [];
  if (added.length)       parts.push(`+${added.length} added`);
  if (removed.length)     parts.push(`-${removed.length} removed`);
  if (typeChanged.length) parts.push(`~${typeChanged.length} type-drift`);
  const summary = parts.length
    ? `schema drift: ${parts.join(', ')}`
    : 'schema unchanged';

  return {
    added, removed, typeChanged,
    total: sheetColumns.length,
    summary,
  };
}

// ════════════════════════════════════════════════════════════════════════
// 10.3 — SMART QUERY RELAXATION (zero-row rescue)
// ════════════════════════════════════════════════════════════════════════

/**
 * Generate progressively simpler SQL variants from a 0-row query.
 *
 * Strategy (in order — caller tries each until rows > 0):
 *   1. Drop ALL date filters (`x ILIKE '%-Apr-26'` and `c_date_actual >= ...`)
 *      — date is the most common over-restriction.
 *   2. Loosen ILIKE: longest ILIKE term gets shortened to first half.
 *   3. Drop the smallest WHERE conjunct (everything except the entity ILIKE).
 *
 * Never modifies aggregates, GROUP BY, ORDER BY, or LIMIT.
 *
 * @param {string} sql
 * @returns {string[]}  array of relaxed SQL strings (may be empty)
 */
function relaxSQL(sql) {
  if (!sql) return [];
  const variants = [];

  // ── L1: drop all date-shaped predicates ──
  // ILIKE on date columns: "c_date ILIKE '%-Apr-26'", "date ILIKE '18-Apr-%'"
  const dateIlikeRe = /\s+AND\s+\w*date\w*\s+ILIKE\s+'[^']*'/gi;
  // INTERVAL / date_trunc-based filters on _actual columns
  const dateActualRe = /\s+AND\s+\w*_actual\b[^)]*?(?=\s+AND\b|\s+GROUP\b|\s+ORDER\b|\s+LIMIT\b|$)/gi;
  // BETWEEN on date columns
  const dateBetweenRe = /\s+AND\s+\w*date\w*\s+BETWEEN\s+'[^']*'\s+AND\s+'[^']*'/gi;

  let v1 = sql.replace(dateIlikeRe, '').replace(dateActualRe, '').replace(dateBetweenRe, '');
  if (v1 !== sql) variants.push(v1);

  // ── L2: loosen the longest ILIKE term ──
  // "party_name ILIKE '%Sanjay Aggarwal%'"  →  "party_name ILIKE '%Sanjay%'"
  const ilikeRe = /(\w+)\s+ILIKE\s+'%([^%']+)%'/gi;
  let longestMatch = null;
  let m;
  while ((m = ilikeRe.exec(sql)) !== null) {
    if (m[2].includes(' ') && (!longestMatch || m[2].length > longestMatch.term.length)) {
      longestMatch = { full: m[0], col: m[1], term: m[2] };
    }
  }
  if (longestMatch) {
    const firstWord = longestMatch.term.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3) {
      const v2 = sql.replace(longestMatch.full, `${longestMatch.col} ILIKE '%${firstWord}%'`);
      if (v2 !== sql) variants.push(v2);
    }
  }

  // ── L3: combine L1 + L2 (drop dates AND loosen entity) ──
  if (variants.length >= 2) {
    let v3 = variants[0];
    if (longestMatch) {
      const firstWord = longestMatch.term.split(/\s+/)[0];
      if (firstWord && firstWord.length >= 3) {
        v3 = v3.replace(longestMatch.full, `${longestMatch.col} ILIKE '%${firstWord}%'`);
        if (v3 !== variants[0] && !variants.includes(v3)) variants.push(v3);
      }
    }
  }

  return variants;
}

// ════════════════════════════════════════════════════════════════════════
// 10.4 — RESULT VALIDATION
// ════════════════════════════════════════════════════════════════════════

/**
 * Heuristic checks for "the SQL ran but the answer is bogus":
 *   - Single-row aggregate with ALL columns NULL  (e.g. SUM of an empty filter)
 *   - User asked for "top N" / "list" but got 0–1 rows
 *   - Every numeric column is exactly 0 (often means filter matched but no data)
 *
 * @param {object[]} rows
 * @param {string}   query    the original user question
 * @returns {{ ok: boolean, hint: string|null }}
 *          hint is a short note the caller can feed back to the AI re-prompt
 */
function validateResult(rows, query) {
  if (!rows) return { ok: false, hint: 'No rows returned.' };
  const q = String(query || '').toLowerCase();

  // ── single-row all-NULL aggregate ──
  if (rows.length === 1) {
    const row = rows[0];
    const keys = Object.keys(row);
    const allNull = keys.every(k => row[k] === null || row[k] === undefined);
    if (allNull && keys.length > 0) {
      return { ok: false, hint: 'Result was a single row with all-NULL values. The WHERE clause likely matched no source rows. Try widening filters or checking column names match the user intent.' };
    }

    // single-row aggregate where every numeric is 0/null AND user asked an aggregate question
    const numerics = keys.map(k => row[k]).filter(v => typeof v === 'number');
    if (numerics.length > 0 && numerics.every(v => v === 0) && /\b(total|sum|kitn[aei]|how much|count|average|avg|highest|lowest)\b/i.test(q)) {
      return { ok: false, hint: 'Aggregate returned 0 for every numeric column. Filters may be too narrow (date / entity / category).' };
    }
  }

  // ── user asked for a list but got <= 1 row ──
  if (rows.length <= 1 && /\b(top\s*\d+|list|sabhi|saare|all|kitne|wise|each|every|breakdown|month-?wise|city-?wise)\b/i.test(q)) {
    return { ok: false, hint: `User asked for a list/breakdown but only ${rows.length} row returned. The GROUP BY may be wrong or filters too tight.` };
  }

  return { ok: true, hint: null };
}

// ════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════════════════════

/**
 * Round-trip the database with a trivial SELECT 1.
 * Used by /health and as a connection-liveness probe.
 *
 * @param {object} supabase
 * @param {object} opts
 * @param {number} opts.timeoutMs   default 3000
 * @returns {Promise<{ok: boolean, latencyMs: number, error?: string}>}
 */
async function pingDb(supabase, opts = {}) {
  const timeoutMs = opts.timeoutMs || 3000;
  const start = Date.now();

  try {
    const racePromise = supabase.rpc('execute_sql', { query: 'SELECT 1 AS ok' });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), timeoutMs));
    const { data, error } = await Promise.race([racePromise, timeout]);
    const latencyMs = Date.now() - start;
    if (error) return { ok: false, latencyMs, error: error.message };
    if (!Array.isArray(data) || data.length === 0) return { ok: false, latencyMs, error: 'empty response' };
    return { ok: true, latencyMs };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: e.message || String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════

module.exports = {
  // 10.6 error classification
  classifyError,
  // 10.5 retry + health
  withRetry,
  pingDb,
  sleep,
  // 10.1 column resolver
  levenshtein,
  findClosestColumn,
  resolveColumnError,
  flattenColumnNames,
  // 10.2 schema drift
  detectSchemaDrift,
  // 10.3 query relaxation
  relaxSQL,
  // 10.4 result validation
  validateResult,
};
