/**
 * Tenant Ledger Helper (Phase 7.5)
 *
 * Detects ledger-type tables in tenant schema, extracts the entity name from
 * "Pansari ka ledger" / "Pansari k ledger bhejo" style queries, and fetches
 * ledger transactions (exact → fuzzy fallback via pg_trgm).
 *
 * Companion: helpers/tenant-ledger-pdf.js renders the styled PDF.
 */

const fmt = require('./smart-format');

// ─────────────────────────────────────────────────────────────────────────
// LEDGER TABLE DETECTION
// ─────────────────────────────────────────────────────────────────────────

/**
 * A "ledger-like" table is one with:
 *   - at least one debit/credit-named column, OR
 *   - a balance/closing_balance/opening_balance column AND a particular/voucher column, OR
 *   - tab name explicitly "ledger" / "khata" / "bahi"
 *
 * Returns array of { pgTable, sourceName, columns, mapping } where mapping is the
 * resolved {nameCol, debitCol, creditCol, dateCol, particularCol, vchTypeCol, vchNoCol,
 * openingBalanceCol, closingBalanceCol} — pg_name strings (or null if absent).
 */
function detectLedgerTables(tablesMetadata) {
  const out = [];
  for (const t of tablesMetadata || []) {
    const tabName = (t.source_name || t.pg_table || '').toLowerCase();
    const cols = t.columns || [];

    const findCol = (re) => {
      for (const c of cols) {
        const n = (c.original || c.pg_name || '').toLowerCase();
        if (re.test(n)) return c.pg_name;
      }
      return null;
    };

    const debitCol           = findCol(/^(?!.*credit).*debit/i) || findCol(/^dr$/i);
    const creditCol          = findCol(/^(?!.*debit).*credit/i) || findCol(/^cr$/i);
    const openingBalanceCol  = findCol(/opening.*balance|opening_bal|open_bal/i);
    const closingBalanceCol  = findCol(/closing.*balance|closing_bal|close_bal|^balance$/i);
    const particularCol      = findCol(/particular|narration|description/i);
    const dateCol            = findCol(/voucher.*date|^date$|txn.*date|trans.*date/i);
    const vchTypeCol         = findCol(/voucher.*type|vch.*type/i);
    const vchNoCol           = findCol(/voucher.*no|voucher.*num|vch.*no|voucher.*number/i);
    const nameCol            = findCol(/^name$|party.*name|account.*name|customer.*name|ledger.*name/i)
                            || cols.find(c => c.role === 'entity')?.pg_name;

    const tabIsLedgerNamed = /ledger|khata|khaata|bahi/i.test(tabName);
    const looksLikeLedger =
      tabIsLedgerNamed ||
      (debitCol && creditCol) ||
      (closingBalanceCol && (particularCol || vchNoCol));

    if (!looksLikeLedger) continue;
    if (!nameCol) continue;  // can't search without a name column

    out.push({
      pgTable: t.pg_table,
      sourceName: t.source_name,
      columns: cols,
      mapping: {
        nameCol,
        debitCol,
        creditCol,
        openingBalanceCol,
        closingBalanceCol,
        particularCol,
        dateCol,
        vchTypeCol,
        vchNoCol,
      },
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// ENTITY-NAME EXTRACTION FROM QUERY
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pull the entity name out of phrases like:
 *   "Pansari ka ledger"           → "Pansari"
 *   "Pansari k ledger bhejo"      → "Pansari"
 *   "Pansari industries ledger"   → "Pansari industries"
 *   "ledger of Acme Corp"         → "Acme Corp"
 *   "show me ABC khata"           → "ABC"
 *   "Acme bahi khata"             → "Acme"
 *
 * Returns trimmed entity string, or null if nothing meaningful left.
 */
function extractEntityFromQuery(query) {
  if (!query) return null;
  let q = String(query).trim();

  // 1) "ledger of X" / "khata of X" — preserve X
  let m = q.match(/(?:ledger|khata|khaata|bahi)\s+(?:of|ka|ke|ki|k)\s+(.+)$/i);
  if (m) return cleanEntity(m[1]);

  // 2) "X ka/k/ke/ki ledger ..." — preserve X
  m = q.match(/^(.+?)\s+(?:ka|ke|ki|k)\s+(?:ledger|khata|khaata|bahi)\b/i);
  if (m) return cleanEntity(m[1]);

  // 3) "X ledger" / "X khata" — strip trailing ledger word (and verbs after it)
  m = q.match(/^(.+?)\s+(?:ledger|khata|khaata|bahi)\b/i);
  if (m) return cleanEntity(m[1]);

  // 4) "ledger X" — strip leading word
  m = q.match(/^(?:ledger|khata|khaata|bahi)\s+(.+)$/i);
  if (m) return cleanEntity(m[1]);

  // 5) Bare "ledger" — no entity given
  if (/^(?:ledger|khata|khaata|bahi)[\s?!.]*$/i.test(q)) return null;

  // 6) Fallback — strip the ledger word and common verbs from anywhere
  return cleanEntity(q.replace(/\b(?:ledger|khata|khaata|bahi|bhejo|dikhao|send|share|please|plz|btao|batao|do|de\s*do)\b/gi, ' ').trim());
}

function cleanEntity(s) {
  if (!s) return null;
  let t = String(s)
    .replace(/\b(?:bhejo|dikhao|send|share|please|plz|btao|batao|de\s*do|do|me|mujhe|mereko|merko)\b/gi, ' ')
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < 2) return null;
  return t;
}

// ─────────────────────────────────────────────────────────────────────────
// DATA FETCH (exact → fuzzy)
// ─────────────────────────────────────────────────────────────────────────

/**
 * SQL escape — wrap an identifier in double quotes (Postgres standard) for
 * safety when interpolating into raw SQL. Pg names from our schema are already
 * lowercased + underscored so this is mostly belt-and-suspenders.
 */
function quoteIdent(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

/**
 * String-literal escape for direct-into-SQL use.
 * pg_trgm RPC takes the value as a parameter so this is only for ILIKE patterns.
 */
function quoteLit(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Find unique entity names in the ledger table that match the search term.
 * Step 1: ILIKE '%term%' (exact substring). If none, falls back to:
 * Step 2: pg_trgm fuzzy_search RPC. If still none, returns [].
 */
async function searchLedgerNames(supabase, ledger, term) {
  const { pgTable, mapping } = ledger;
  const nameCol = mapping.nameCol;

  // Step 1: ILIKE
  const sql = `SELECT DISTINCT ${quoteIdent(nameCol)} AS name FROM ${quoteIdent(pgTable)} WHERE ${quoteIdent(nameCol)} ILIKE ${quoteLit('%' + term + '%')} ORDER BY name LIMIT 8`;
  const exact = await supabase.rpc('execute_sql', { query: sql });
  const exactRows = (exact.data || []).map(r => r.name).filter(Boolean);
  if (exactRows.length) return { matches: exactRows, fuzzy: false };

  // Step 2: pg_trgm fuzzy
  try {
    const fz = await supabase.rpc('tenant_fuzzy_search', {
      p_table: pgTable,
      p_column: nameCol,
      p_query: term,
      p_limit: 5,
    });
    const fuzzyRows = (fz.data || [])
      .filter(r => (r.score || 0) > 0.15)
      .map(r => r.value)
      .filter(Boolean);
    return { matches: fuzzyRows, fuzzy: true };
  } catch (e) {
    return { matches: [], fuzzy: false };
  }
}

/**
 * Fetch all ledger rows for a specific name.
 * Returns rows ordered by date (or original order if date column absent).
 */
async function fetchLedgerForName(supabase, ledger, name) {
  const { pgTable, mapping } = ledger;
  const nameCol = mapping.nameCol;
  const dateCol = mapping.dateCol;

  const orderClause = dateCol
    ? `ORDER BY ${quoteIdent(dateCol)} ASC NULLS LAST`
    : '';

  const sql = `SELECT * FROM ${quoteIdent(pgTable)} WHERE ${quoteIdent(nameCol)} = ${quoteLit(name)} ${orderClause} LIMIT 5000`;
  const r = await supabase.rpc('execute_sql', { query: sql });
  if (r.error) throw new Error(r.error.message);
  return r.data || [];
}

module.exports = {
  detectLedgerTables,
  extractEntityFromQuery,
  searchLedgerNames,
  fetchLedgerForName,
};
