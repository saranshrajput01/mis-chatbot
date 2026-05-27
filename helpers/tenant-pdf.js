/**
 * Tenant PDF Generator (Phase 7.1)
 *
 * Generates a styled landscape A4 PDF for tenant query results.
 * Type-aware: uses smart-format's role inference, so currency cols get ₹,
 * quantities don't, dates are trimmed, IDs are raw.
 *
 * Used by helpers/tenant-router.js when SQL result has > 50 rows.
 *
 * Output: temp file path (caller is responsible for cleanup; whatsapp.js
 * unlinks after upload — same pattern as MIS Main).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const fmt = require('./smart-format');

// ─────────────────────────────────────────────────────────────────────────
// VALUE FORMATTING (PDF cell — shorter than WhatsApp text)
// ─────────────────────────────────────────────────────────────────────────

function pdfFormatValue(value, role) {
  if (value === null || value === undefined || value === '') return '-';
  switch (role) {
    case 'currency': return formatCurrencyShort(value);
    case 'quantity': return formatQtyShort(value);
    case 'rate':     return formatCurrencyShort(value);
    case 'percent':  return `${parseFloat(value).toFixed(2)}%`;
    case 'count':
    case 'number':   return formatNumberShort(value);
    case 'date':     return String(value).split('T')[0].slice(0, 12);
    default:         return String(value).slice(0, 40);
  }
}

function formatCurrencyShort(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return String(n);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatQtyShort(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatNumberShort(n) {
  const num = parseFloat(n);
  if (isNaN(num)) return String(n);
  if (Number.isInteger(num)) return num.toLocaleString('en-IN');
  return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build aggregate footer (sum of currency/quantity/count cols across rows).
 */
function buildFooterTotals(rows, keys, roleMap) {
  const lines = [];
  for (const k of keys) {
    const meta = roleMap[k] || roleMap[k.toLowerCase()];
    if (!meta) continue;
    if (!['currency', 'quantity', 'count', 'number'].includes(meta.role)) continue;
    let total = 0, count = 0;
    for (const r of rows) {
      const n = parseFloat(r[k]);
      if (!isNaN(n)) { total += n; count++; }
    }
    if (count === 0) continue;
    const label = fmt.humanizeLabel(meta.original || k);
    const value = pdfFormatValue(total, meta.role);
    lines.push(`${label}: ${value}`);
  }
  return lines;
}

/**
 * Generate a PDF from result rows.
 *
 * @param rows         array of result objects
 * @param tableColumns columnsMeta from tenants.tables_metadata for the queried table
 *                     (used for role lookup; pass [] to fall back to inference)
 * @param opts         { title, query, dbName }
 * @returns Promise<string>  absolute path to the temp PDF file
 */
async function generateTenantPDF(rows, tableColumns = [], opts = {}) {
  if (!rows || !rows.length) throw new Error('No rows to render');

  const title = opts.title || 'Query Results';
  const query = (opts.query || '').slice(0, 200);
  const dbName = opts.dbName || 'Database';

  // Role map for this result set (uses tableColumns + key-name inference)
  const roleMap = fmt.buildRoleMap(rows[0], tableColumns);
  const keys = Object.keys(rows[0]);

  // Smart column limit — fit on landscape A4, but allow up to all keys for narrow data
  const displayCols = keys.length > 10 ? keys.slice(0, 10) : keys;

  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `tenant_data_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 18, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);

      const margin = 18;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const tableW = pageW - margin * 2;
      const colW = Math.floor(tableW / displayCols.length);
      const fontSize = displayCols.length > 8 ? 6 : 7;
      const rowH = displayCols.length > 8 ? 12 : 13;

      function drawHeader() {
        doc.rect(0, 0, pageW, 42).fill('#1a1a2e');
        doc.fillColor('#fff').fontSize(11).font('Helvetica-Bold')
           .text(`${dbName} — ${title}`, margin, 10, { align: 'center', width: tableW });
        if (query) {
          doc.fillColor('#aab').fontSize(8).font('Helvetica-Oblique')
             .text(`Query: ${query}`, margin, 26, { align: 'center', width: tableW, lineBreak: false });
        }
        doc.fillColor('#000');
      }

      function drawColHeaders(y) {
        doc.rect(margin, y, tableW, 16).fill('#333355');
        doc.fillColor('#fff').fontSize(fontSize).font('Helvetica-Bold');
        displayCols.forEach((col, i) => {
          const meta = roleMap[col] || roleMap[col.toLowerCase()] || {};
          const label = fmt.humanizeLabel(meta.original || col).slice(0, 18);
          doc.text(label, margin + i * colW + 2, y + 4, { width: colW - 4, lineBreak: false });
        });
        doc.fillColor('#000');
        return y + 16;
      }

      drawHeader();
      let y = 48;
      y = drawColHeaders(y);

      doc.fontSize(fontSize).font('Helvetica');
      rows.forEach((row, i) => {
        if (y + rowH > pageH - 35) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 18 });
          drawHeader();
          y = 48;
          y = drawColHeaders(y);
          doc.fontSize(fontSize).font('Helvetica');
        }

        // Zebra striping
        doc.rect(margin, y, tableW, rowH).fill(i % 2 === 0 ? '#ffffff' : '#f5f5fa');
        doc.fillColor('#000');

        displayCols.forEach((col, ci) => {
          const meta = roleMap[col] || roleMap[col.toLowerCase()] || { role: 'text' };
          const value = pdfFormatValue(row[col], meta.role);
          doc.text(value, margin + ci * colW + 2, y + 3, { width: colW - 4, lineBreak: false, ellipsis: true });
        });

        y += rowH;
      });

      // Footer with totals
      const footerLines = buildFooterTotals(rows, keys, roleMap);
      if (y + 30 > pageH - 30) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 18 });
        drawHeader();
        y = 48;
      }

      doc.fontSize(8).fillColor('#444').font('Helvetica-Bold')
         .text(`Total Rows: ${rows.length}`, margin, y + 6);
      if (footerLines.length) {
        doc.fontSize(7).fillColor('#666').font('Helvetica')
           .text(footerLines.join('  |  '), margin + 100, y + 7, {
             width: tableW - 100,
             lineBreak: false,
             ellipsis: true,
           });
      }

      doc.end();
      stream.on('finish', () => resolve(tmpPath));
      stream.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Build a short WhatsApp summary message for the PDF.
 * Includes total row count + aggregate totals across numeric columns.
 */
function buildPdfSummary(rows, tableColumns = []) {
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

  let msg = `📄 Sending PDF with *${rows.length} results*...`;
  if (parts.length) msg += `\n\n📊 *Totals:* ${parts.join(' | ')}`;
  return msg;
}

module.exports = {
  generateTenantPDF,
  buildPdfSummary,
};
