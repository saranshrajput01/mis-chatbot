/**
 * Tenant CSV Generator (Phase 7.2)
 *
 * Generates a CSV file from tenant SQL query results.
 *
 * Used by helpers/tenant-router.js when the result has > 100 rows.
 * For 50–100 rows we send a styled PDF (helpers/tenant-pdf.js).
 * For >100 rows the data is too large for a useful PDF, so we ship raw CSV
 * which the user can open in Excel / Sheets and pivot themselves.
 *
 * Design choices:
 *   - Raw numeric values (no ₹, no commas, no L/Cr suffix) — Excel-friendly
 *   - All columns included (PDF caps at 10 to fit landscape)
 *   - Proper CSV escaping per RFC 4180 (quotes, commas, newlines, CRs)
 *   - UTF-8 BOM prefix so Excel correctly displays ₹/Hindi characters
 *   - Filename: <safe-db-name>_<safe-title>_<timestamp>.csv
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const fmt = require('./smart-format');

// ─────────────────────────────────────────────────────────────────────────
// CSV ESCAPING (RFC 4180)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Escape a single CSV cell.
 *  - null/undefined → empty string
 *  - numbers → as-is (no thousands separator)
 *  - strings containing comma, quote, newline, or carriage return → wrapped
 *    in double quotes with internal quotes doubled
 */
function escapeCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    return String(v);
  }
  let s = String(v);
  if (s === '') return '';
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Sanitize a string for safe filesystem use.
 */
function safeName(s, maxLen = 40) {
  return String(s || '')
    .replace(/[^\w\d\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLen) || 'data';
}

/**
 * Build a humanised CSV header row from result keys + tenant metadata.
 */
function buildHeader(keys, roleMap) {
  return keys.map(k => {
    const meta = roleMap[k] || roleMap[k.toLowerCase()] || {};
    return escapeCell(fmt.humanizeLabel(meta.original || k));
  }).join(',');
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate a CSV file from result rows.
 *
 * @param rows         array of result objects from PostgreSQL
 * @param tableColumns columnsMeta from tenants.tables_metadata for the queried table
 *                     (used only for human-friendly header labels)
 * @param opts         { title, dbName }
 * @returns Promise<string>  absolute path to the temp CSV file
 */
async function generateTenantCSV(rows, tableColumns = [], opts = {}) {
  if (!rows || !rows.length) throw new Error('No rows to render');

  const title = opts.title || 'results';
  const dbName = opts.dbName || 'database';

  const roleMap = fmt.buildRoleMap(rows[0], tableColumns);
  const keys = Object.keys(rows[0]);

  // Build CSV body in memory — these are query results so size is bounded
  // by the SQL LIMIT (currently 200 in tenant-router, plenty of headroom).
  const lines = [buildHeader(keys, roleMap)];
  for (const r of rows) {
    lines.push(keys.map(k => escapeCell(r[k])).join(','));
  }

  // UTF-8 BOM so Excel renders ₹ and Hindi characters correctly
  const BOM = '\uFEFF';
  const content = BOM + lines.join('\r\n') + '\r\n';

  const fileName = `${safeName(dbName)}_${safeName(title)}_${Date.now()}.csv`;
  const tmpPath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(tmpPath, content, 'utf8');
  return tmpPath;
}

/**
 * Build a short WhatsApp summary message for the CSV attachment.
 * Includes total row count + aggregate totals across numeric columns.
 */
function buildCsvSummary(rows, tableColumns = []) {
  if (!rows || !rows.length) return null;
  const roleMap = fmt.buildRoleMap(rows[0], tableColumns);
  const keys = Object.keys(rows[0]);

  const summable = keys.filter(k => {
    const meta = roleMap[k] || roleMap[k.toLowerCase()];
    return meta && ['currency', 'quantity', 'count', 'number'].includes(meta.role);
  });

  const parts = [];
  for (const k of summable) {
    const meta = roleMap[k] || roleMap[k.toLowerCase()];
    if (meta.role === 'rate') continue;
    let total = 0, count = 0;
    for (const r of rows) {
      const n = parseFloat(r[k]);
      if (!isNaN(n)) { total += n; count++; }
    }
    if (count === 0) continue;
    const label = fmt.humanizeLabel(meta.original || k);
    const formatted = fmt.formatValue(total, meta.role);
    if (formatted) parts.push(`*${label}:* ${formatted}`);
  }

  let msg = `📊 Sending CSV with *${rows.length} rows* (open in Excel/Sheets).`;
  if (parts.length) msg += `\n\n📈 *Totals:* ${parts.join(' | ')}`;
  return msg;
}

module.exports = {
  generateTenantCSV,
  buildCsvSummary,
};
