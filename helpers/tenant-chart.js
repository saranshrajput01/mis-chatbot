/**
 * Tenant Chart Generator (Phase 7.4)
 *
 * Renders chart images via QuickChart.io (same approach as MIS Main).
 *
 * Flow:
 *   1. AI generates aggregating SQL (label_col + numeric value_col, GROUP BY).
 *   2. SQL runs — produces typically 5–12 rows.
 *   3. We auto-infer chart type from the user's wording (pie/doughnut/line, default bar).
 *   4. We pick label_col (first non-numeric column) + value_col (first numeric column).
 *   5. Build QuickChart URL → fetch PNG → save to temp → return path.
 *
 * Server.js call site already handles media={type:'image', path:...} and ships it via
 * sendWhatsAppMedia (which now picks MIME from extension — so .png uploads as image/png).
 */

const fmt = require('./smart-format');

// ─────────────────────────────────────────────────────────────────────────
// CHART CONFIG INFERENCE
// ─────────────────────────────────────────────────────────────────────────

/**
 * Detect chart type from user query keywords. Defaults to bar.
 */
function inferChartType(query) {
  const q = (query || '').toLowerCase();
  if (/\bpie\b/.test(q)) return 'pie';
  if (/\bdoughnut|donut\b/.test(q)) return 'doughnut';
  if (/\bline\b|\btrend\b|\bover\s+time\b|\btime\s*series\b|month[- ]?wise|date[- ]?wise/.test(q)) return 'line';
  if (/\bbar\b|\bcolumn\b|\bgrouped\b/.test(q)) return 'bar';
  return 'bar';
}

/**
 * From a result row + roleMap, pick best label column (text/entity/category/date)
 * and best value column (currency/quantity/count/number/rate).
 *
 * Returns { labelCol, valueCol } or null if we can't form a meaningful chart.
 */
function inferLabelValueCols(row, roleMap) {
  const keys = Object.keys(row);
  const NUMERIC_ROLES = ['currency', 'quantity', 'count', 'number', 'rate'];
  const LABEL_ROLES   = ['entity', 'location', 'category', 'date', 'id', 'text'];

  let labelCol = null;
  let valueCol = null;

  // First pass: explicit role match
  for (const k of keys) {
    const meta = roleMap[k] || roleMap[k.toLowerCase()];
    const role = meta && meta.role;
    if (!labelCol && LABEL_ROLES.includes(role)) labelCol = k;
    if (!valueCol && NUMERIC_ROLES.includes(role)) valueCol = k;
  }

  // Fallback: probe by raw value type (label = first string, value = first number-parseable)
  if (!labelCol) {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === 'string' || (v !== null && typeof v !== 'number' && !/^-?\d+(\.\d+)?$/.test(String(v)))) {
        labelCol = k;
        break;
      }
    }
  }
  if (!valueCol) {
    for (const k of keys) {
      if (k === labelCol) continue;
      const v = row[k];
      const n = typeof v === 'number' ? v : parseFloat(v);
      if (!isNaN(n)) { valueCol = k; break; }
    }
  }

  if (!labelCol || !valueCol || labelCol === valueCol) return null;
  return { labelCol, valueCol };
}

// ─────────────────────────────────────────────────────────────────────────
// CHART URL BUILDER + IMAGE DOWNLOAD
// ─────────────────────────────────────────────────────────────────────────
// Both functions now live in helpers/chart-builder.js so MIS Main and tenant
// flows share identical visuals. Re-exported below for any external callers
// that imported them from this module.
const { buildChartURL, downloadChartImage } = require('./chart-builder');

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate a chart PNG from result rows.
 *
 * @param rows         array of result objects (typically 5–12 grouped rows)
 * @param query        user's question (used for chart type inference + title)
 * @param tableColumns columnsMeta from tenants.tables_metadata for role lookup
 * @param opts         { dbName?: string, title?: string }
 * @returns Promise<{ path, type, title, labelCol, valueCol }>
 */
async function generateTenantChart(rows, query, tableColumns = [], opts = {}) {
  if (!rows || !rows.length) throw new Error('No rows to chart');
  if (rows.length > 30) rows = rows.slice(0, 30); // hard cap (charts get unreadable past this)

  const roleMap = fmt.buildRoleMap(rows[0], tableColumns);
  const cols = inferLabelValueCols(rows[0], roleMap);
  if (!cols) throw new Error('Could not pick a label/value column from result');

  const type = inferChartType(query);
  const title = opts.title
    || (query ? query.slice(0, 60) : `${fmt.humanizeLabel(cols.valueCol)} by ${fmt.humanizeLabel(cols.labelCol)}`);

  const chartConfig = { type, title, label_col: cols.labelCol, value_col: cols.valueCol };
  const url = buildChartURL(chartConfig, rows);
  const filePath = await downloadChartImage(url);

  return { path: filePath, type, title, labelCol: cols.labelCol, valueCol: cols.valueCol };
}

module.exports = {
  generateTenantChart,
  inferChartType,
  inferLabelValueCols,
  buildChartURL,
  downloadChartImage,
};
