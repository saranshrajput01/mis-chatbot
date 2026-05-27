/**
 * Shared Chart Builder — single source of truth for QuickChart.io rendering.
 *
 * Why a single module?
 *   server.js (MIS Main flow) and helpers/tenant-chart.js (tenant flow) used to
 *   carry near-identical copies that drifted over time. Both copies also had a
 *   silent bug: y-axis tick callbacks defined as JS functions never reached
 *   QuickChart because JSON.stringify drops function values.
 *
 * Approach taken here (after testing several alternatives):
 *   1. Pre-scale the numeric values to a friendly unit (Cr / L / K) BEFORE
 *      sending them to QuickChart. The y-axis then auto-formats clean numbers
 *      (0.5, 1.0, 1.5...) without needing a custom callback. The unit is shown
 *      in the chart title and y-axis title.
 *   2. Datalabels (numbers on top of bars / inside slices) get the unit
 *      appended via QuickChart's documented chart-as-JS-literal POST endpoint —
 *      verified to work in practice.
 *   3. POST endpoint instead of GET URL — no URL-length cap, JS literals stay
 *      intact, more reliable across QuickChart updates.
 *
 * Public API:
 *   renderChartPng(chartConfig, rows, opts?) → Promise<filePath>
 *     Builds the chart definition + downloads the PNG to a tmp file.
 *
 *   pickUnit(values) → { unit: 'Cr'|'L'|'K'|'', divisor: number }
 *     Exposed for callers that want to display matching captions.
 *
 *   truncateLabel(s, max?) → 'Long company name…'
 *
 *   COLORS — 12-entry palette
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// 12-color palette — repeats if more bars than colors.
const COLORS = [
  '#4361ee', '#e63946', '#2ec4b6', '#ff9f1c',
  '#7209b7', '#06d6a0', '#f72585', '#118ab2',
  '#ffd166', '#073b4c', '#06aed5', '#f15bb5',
];

/**
 * Choose a friendly unit + divisor based on the max absolute value.
 *  ≥ 1 Cr (1e7) → "Cr"   ≥ 1 L (1e5) → "L"   ≥ 1k → "K"   else ""
 */
function pickUnit(values) {
  const max = values.reduce((m, v) => Math.max(m, Math.abs(Number(v) || 0)), 0);
  if (max >= 1e7) return { unit: 'Cr', divisor: 1e7 };
  if (max >= 1e5) return { unit: 'L',  divisor: 1e5 };
  if (max >= 1e3) return { unit: 'K',  divisor: 1e3 };
  return { unit: '', divisor: 1 };
}

/** Trim long axis labels so they don't overlap on the chart. */
function truncateLabel(s, max = 25) {
  if (s === null || s === undefined) return '';
  const str = String(s);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/**
 * Build the chart definition as a JavaScript literal STRING (NOT JSON).
 * QuickChart's POST endpoint accepts this and eval()s it, which preserves
 * inline functions (e.g., the datalabels formatter).
 *
 * @param {Object} chartConfig  { type, title, label_col, value_col }
 * @param {Array}  rows
 * @param {Object} opts         { maxLabelChars }
 * @returns { jsLiteral, unit, scaledValues, labels }
 */
function buildChartLiteral(chartConfig, rows, opts = {}) {
  const maxChars = opts.maxLabelChars || 25;

  const rawLabels = rows.map((r) => truncateLabel(r[chartConfig.label_col] ?? '', maxChars));
  const rawValues = rows.map((r) => parseFloat(r[chartConfig.value_col] ?? 0) || 0);
  const chartType = chartConfig.type || 'bar';
  const isPieish  = chartType === 'pie' || chartType === 'doughnut';

  const { unit, divisor } = pickUnit(rawValues);
  const scaled = rawValues.map((v) => +(v / divisor).toFixed(2));

  // Color assignment.
  let backgroundColor;
  if (isPieish) {
    backgroundColor = scaled.map((_, i) => COLORS[i % COLORS.length]);
  } else if (chartType === 'bar') {
    backgroundColor = scaled.map((_, i) => COLORS[i % COLORS.length] + 'cc'); // ~80% alpha
  } else {
    backgroundColor = '#4361ee33'; // light fill under line
  }

  // Title — append unit if scaled
  const baseTitle = chartConfig.title || 'Chart';
  const fullTitle = unit ? `${baseTitle} (in ${unit})` : baseTitle;

  // Build the chart as JS literal so the datalabels formatter (a real function)
  // survives QuickChart's eval. We embed JSON for arrays/strings, JS for funcs.
  const labelsJson  = JSON.stringify(rawLabels);
  const dataJson    = JSON.stringify(scaled);
  const colorsJson  = JSON.stringify(backgroundColor);
  const titleSafe   = fullTitle.replace(/'/g, "\\'");
  const yTitleSafe  = unit ? `'₹ in ${unit}'` : "'Value'";
  const fmtSuffix   = unit ? ` ' ${unit}'` : "''";

  const datalabelsBlock = `
        datalabels: {
          display: true,
          anchor: ${isPieish ? "'center'" : "'end'"},
          align:  ${isPieish ? "'center'" : "'top'"},
          color:  ${isPieish ? "'#ffffff'" : "'#1a1a2e'"},
          font:   { size: 12, weight: 'bold' },
          formatter: function(v) { return v.toFixed(2) +${fmtSuffix}; }
        }`;

  const scalesBlock = isPieish ? '{}' : `{
        y: {
          beginAtZero: true,
          title: { display: ${unit ? 'true' : 'false'}, text: ${yTitleSafe}, font: { size: 12, weight: 'bold' }, color: '#555' },
          ticks: { font: { size: 11 }, color: '#555' },
          grid:  { color: 'rgba(0,0,0,0.06)' }
        },
        x: {
          ticks: { font: { size: 11 }, color: '#333', maxRotation: 50, minRotation: 30, autoSkip: false },
          grid:  { display: false }
        }
      }`;

  const datasetExtras = chartType === 'line'
    ? `, borderColor: '#4361ee', borderWidth: 3, fill: true, tension: 0.4, pointRadius: 5, pointBackgroundColor: '#4361ee'`
    : isPieish
      ? `, borderColor: '#ffffff', borderWidth: 2`
      : `, borderColor: 'rgba(0,0,0,0.12)', borderWidth: 1`;

  const jsLiteral = `{
    type: '${chartType}',
    data: {
      labels: ${labelsJson},
      datasets: [{
        label: '${titleSafe}',
        data: ${dataJson},
        backgroundColor: ${colorsJson}${datasetExtras}
      }]
    },
    options: {
      layout: { padding: { top: 30, right: 24, bottom: 24, left: 12 } },
      plugins: {
        title:  { display: true, text: '${titleSafe}', font: { size: 20, weight: 'bold' }, color: '#1a1a2e', padding: { top: 6, bottom: 18 } },
        legend: { display: ${isPieish ? 'true' : 'false'}, position: 'right', labels: { font: { size: 12 }, color: '#1a1a2e' } },${datalabelsBlock}
      },
      scales: ${scalesBlock}
    }
  }`;

  return { jsLiteral, unit, scaledValues: scaled, labels: rawLabels };
}

/**
 * Render a chart and save the PNG to a temp file.
 *
 * @param {Object} chartConfig  { type, title, label_col, value_col }
 * @param {Array}  rows
 * @param {Object} [opts]
 *   width        — default 1400
 *   height       — default 700
 *   maxLabelChars — default 25
 *   bgColor      — default 'white'
 *   timeoutMs    — default 25000
 *   prefix       — temp filename prefix (default 'chart')
 * @returns {Promise<string>} absolute path to the saved PNG
 */
async function renderChartPng(chartConfig, rows, opts = {}) {
  if (!rows || !rows.length) throw new Error('No rows to chart');

  const { jsLiteral } = buildChartLiteral(chartConfig, rows, { maxLabelChars: opts.maxLabelChars });

  const body = {
    chart: jsLiteral,
    width:  opts.width  || 1400,
    height: opts.height || 700,
    format: 'png',
    backgroundColor: opts.bgColor || 'white',
  };

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 25000);
  try {
    const resp = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`QuickChart returned HTTP ${resp.status}${errText ? ': ' + errText.slice(0, 200) : ''}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < 200) {
      throw new Error(`QuickChart returned suspiciously small file (${buf.length} bytes)`);
    }
    const tmpPath = path.join(os.tmpdir(), `${opts.prefix || 'chart'}_${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buf);
    return tmpPath;
  } finally {
    clearTimeout(timer);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Backward-compat shims — old call sites used buildChartURL + downloadChartImage.
// New flow is one async call. We keep these names but make them work end-to-end:
//
//   const url     = buildChartURL(cfg, rows);   // returns a sentinel object
//   const imgPath = await downloadChartImage(url);  // does the actual POST + save
//
// This keeps both the WhatsApp and web call sites working without touching them.
// ──────────────────────────────────────────────────────────────────────────

/**
 * Legacy: returns an opaque "render request" object that downloadChartImage will
 * execute. Kept so existing call sites work unchanged.
 */
function buildChartURL(chartConfig, rows, opts = {}) {
  return { __chartRenderRequest: true, chartConfig, rows, opts };
}

/**
 * Legacy: accepts either the sentinel object from buildChartURL, OR an old-style
 * URL string (no longer used but kept defensively).
 */
async function downloadChartImage(req, opts = {}) {
  if (req && req.__chartRenderRequest) {
    return renderChartPng(req.chartConfig, req.rows, { ...req.opts, ...opts });
  }
  // If somehow a real URL was passed (shouldn't happen post-refactor), fall back
  // to a plain GET fetch so we don't break.
  if (typeof req === 'string' && req.startsWith('http')) {
    const resp = await fetch(req);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const tmpPath = path.join(os.tmpdir(), `chart_${Date.now()}.png`);
    fs.writeFileSync(tmpPath, buf);
    return tmpPath;
  }
  throw new Error('downloadChartImage: unrecognized argument');
}

module.exports = {
  renderChartPng,
  buildChartLiteral,
  pickUnit,
  truncateLabel,
  COLORS,
  // Legacy shims:
  buildChartURL,
  downloadChartImage,
};
