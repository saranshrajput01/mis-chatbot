/**
 * Tenant Ledger PDF Generator (Phase 7.5)
 *
 * Renders a styled landscape A4 ledger PDF for tenant query results.
 * Visual style cloned from server.js generateLedgerPDF for parity:
 *   - Dark navy header (#1a1a2e) with tenant name + entity + date range
 *   - 7-column transaction table: Date | Type (To/By) | Particulars | Vch Type | Vch No | Debit | Credit
 *   - Opening balance row (#f0f4ff)
 *   - Zebra-striped txns (#fff/#f9f9f9)
 *   - Closing balance row (#e8eaf6 bold)
 *   - Grand total row (#c8c8c8)
 *
 * Generic over schema: takes a `mapping` of column roles (nameCol, debitCol, etc.)
 * resolved from helpers/tenant-ledger.js detectLedgerTables.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');

// ─────────────────────────────────────────────────────────────────────────
// FORMATTING UTILITIES
// ─────────────────────────────────────────────────────────────────────────

function fmtAmt(n) {
  const num = parseFloat(n);
  if (isNaN(num) || num === 0) return '';
  return Math.abs(num).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '';
  const s = String(d).trim();
  // ISO date — strip time
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const dt = new Date(s);
    if (!isNaN(dt)) return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
  }
  // Already formatted like "1-Apr-26" — pass through
  return s.slice(0, 12);
}

function pickFirstDefined(row, keys) {
  for (const k of keys) {
    if (k && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────

/**
 * Generate the styled ledger PDF.
 *
 * @param rows     transaction rows (already filtered by entity name)
 * @param mapping  column-role map from detectLedgerTables
 * @param opts     { entityName, dbName, tabName }
 * @returns Promise<string>  temp file path
 */
async function generateTenantLedgerPDF(rows, mapping, opts = {}) {
  if (!rows || !rows.length) throw new Error('No ledger rows to render');

  const entityName = opts.entityName || 'Account';
  const dbName     = opts.dbName     || 'Database';
  const tabName    = opts.tabName    || 'LEDGER';

  // Pull opening / closing balance from first row (same value across rows for a single account
  // in Tally-style exports). If schema doesn't have explicit balance cols, leave 0.
  const first = rows[0];
  const openBal = mapping.openingBalanceCol
    ? parseFloat(first[mapping.openingBalanceCol]) || 0
    : 0;
  const closeBal = mapping.closingBalanceCol
    ? parseFloat(rows[rows.length - 1][mapping.closingBalanceCol] ?? first[mapping.closingBalanceCol]) || 0
    : 0;

  // Filter out balance marker rows (Tally exports often have an explicit "Opening Balance"
  // and "Closing Balance" row in the particular column — skip those from the txns table)
  const balanceParticulars = new Set(['Opening Balance', 'Closing Balance', '']);
  const txns = mapping.particularCol
    ? rows.filter(r => {
        const p = String(r[mapping.particularCol] || '').trim();
        return p && !balanceParticulars.has(p);
      })
    : rows;

  // Date range for header
  const dates = txns
    .map(r => mapping.dateCol ? r[mapping.dateCol] : null)
    .filter(Boolean)
    .sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : '';
  const lastDate  = dates[dates.length - 1] ? fmtDate(dates[dates.length - 1]) : firstDate;

  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `tenant_ledger_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 25, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);

      const margin = 25;
      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const tableW = pageW - margin * 2;

      // Column widths — proportional to MIS Main's, retotalled for tableW
      const colWidths = { date: 75, type: 22, particular: 230, vchType: 85, vchNo: 90, debit: 100, credit: 100 };
      // Scale to actual tableW so the columns always span exactly the page width
      const totalCols = Object.values(colWidths).reduce((a, b) => a + b, 0);
      const scale = tableW / totalCols;
      Object.keys(colWidths).forEach(k => { colWidths[k] = Math.floor(colWidths[k] * scale); });

      const colX = {};
      let xPos = margin;
      Object.entries(colWidths).forEach(([k, w]) => { colX[k] = xPos; xPos += w; });

      const ROW_H = 14;
      const HEADER_H = 16;

      function drawPageHeader() {
        doc.rect(0, 0, pageW, 55).fill('#1a1a2e');
        doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold')
           .text(dbName, margin, 10, { align: 'center', width: tableW });
        doc.fontSize(8).font('Helvetica')
           .text(`Auto-generated ledger from "${tabName}"`, margin, 27, { align: 'center', width: tableW });
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff')
           .text(
             `Ledger: ${entityName}` + ((firstDate && lastDate) ? `   |   ${firstDate} to ${lastDate}` : ''),
             margin, 40, { align: 'center', width: tableW }
           );
      }

      function drawColumnHeaders(y) {
        doc.rect(margin, y, tableW, HEADER_H).fill('#333355');
        doc.fillColor('#fff').fontSize(7.5).font('Helvetica-Bold');
        doc.text('Date',         colX.date,       y + 4, { width: colWidths.date });
        doc.text('',             colX.type,       y + 4, { width: colWidths.type });
        doc.text('Particulars',  colX.particular, y + 4, { width: colWidths.particular });
        doc.text('Vch Type',     colX.vchType,    y + 4, { width: colWidths.vchType });
        doc.text('Vch No.',      colX.vchNo,      y + 4, { width: colWidths.vchNo });
        doc.text('Debit (Rs.)',  colX.debit,      y + 4, { width: colWidths.debit,  align: 'right' });
        doc.text('Credit (Rs.)', colX.credit,     y + 4, { width: colWidths.credit, align: 'right' });
        return y + HEADER_H;
      }

      drawPageHeader();
      let y = 58;
      y = drawColumnHeaders(y);

      // ── Opening balance row ──
      doc.rect(margin, y, tableW, ROW_H).fill('#f0f4ff');
      doc.fillColor('#000').fontSize(7).font('Helvetica-Bold');
      doc.text(firstDate || '', colX.date, y + 3, { width: colWidths.date });
      doc.text('To',            colX.type, y + 3, { width: colWidths.type });
      doc.text('Opening Balance', colX.particular, y + 3, { width: colWidths.particular });
      doc.text('', colX.vchType, y + 3, { width: colWidths.vchType });
      doc.text('', colX.vchNo,   y + 3, { width: colWidths.vchNo });
      doc.text(openBal > 0 ? fmtAmt(openBal) : '', colX.debit,  y + 3, { width: colWidths.debit,  align: 'right' });
      doc.text(openBal < 0 ? fmtAmt(openBal) : '', colX.credit, y + 3, { width: colWidths.credit, align: 'right' });
      y += ROW_H;

      // ── Transaction rows ──
      doc.fontSize(7).font('Helvetica');
      txns.forEach((r, i) => {
        if (y > pageH - 55) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 25 });
          drawPageHeader();
          y = 58;
          y = drawColumnHeaders(y);
          doc.fontSize(7).font('Helvetica');
        }

        const debitVal  = mapping.debitCol  ? parseFloat(r[mapping.debitCol])  || 0 : 0;
        const creditVal = mapping.creditCol ? parseFloat(r[mapping.creditCol]) || 0 : 0;
        const isDr = debitVal > 0;

        doc.rect(margin, y, tableW, ROW_H).fill(i % 2 === 0 ? '#ffffff' : '#f9f9f9');
        doc.fillColor('#000');

        doc.text(fmtDate(mapping.dateCol ? r[mapping.dateCol] : ''), colX.date, y + 3, { width: colWidths.date });
        doc.text(isDr ? 'To' : 'By', colX.type, y + 3, { width: colWidths.type });
        doc.text(String(mapping.particularCol ? r[mapping.particularCol] || '' : '').slice(0, 50), colX.particular, y + 3, { width: colWidths.particular });
        doc.text(String(mapping.vchTypeCol ? r[mapping.vchTypeCol] || '' : '').slice(0, 18), colX.vchType, y + 3, { width: colWidths.vchType });
        doc.text(String(mapping.vchNoCol ? r[mapping.vchNoCol] || '' : '').slice(0, 18), colX.vchNo, y + 3, { width: colWidths.vchNo });
        doc.text(isDr  ? fmtAmt(debitVal)  : '', colX.debit,  y + 3, { width: colWidths.debit,  align: 'right' });
        doc.text(!isDr ? fmtAmt(creditVal) : '', colX.credit, y + 3, { width: colWidths.credit, align: 'right' });

        y += ROW_H;
      });

      // ── Closing balance row ──
      if (y > pageH - 45) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 25 });
        drawPageHeader();
        y = 58;
        y = drawColumnHeaders(y);
      }

      doc.rect(margin, y, tableW, ROW_H).fill('#e8eaf6');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7.5);
      doc.text('Closing Balance', colX.date, y + 3, {
        width: colWidths.date + colWidths.type + colWidths.particular + colWidths.vchType + colWidths.vchNo,
      });
      doc.text(closeBal > 0 ? fmtAmt(closeBal) : '', colX.debit,  y + 3, { width: colWidths.debit,  align: 'right' });
      doc.text(closeBal < 0 ? fmtAmt(closeBal) : '', colX.credit, y + 3, { width: colWidths.credit, align: 'right' });
      y += ROW_H;

      // ── Grand total ──
      const totalDr = txns.reduce((s, r) => s + (mapping.debitCol  ? parseFloat(r[mapping.debitCol])  || 0 : 0), 0);
      const totalCr = txns.reduce((s, r) => s + (mapping.creditCol ? parseFloat(r[mapping.creditCol]) || 0 : 0), 0);
      const grandDr = totalDr + (openBal > 0 ? openBal : 0);
      const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

      doc.rect(margin, y, tableW, ROW_H).fill('#c8c8c8');
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(7.5);
      doc.text('Grand Total', colX.date, y + 3, {
        width: colWidths.date + colWidths.type + colWidths.particular + colWidths.vchType + colWidths.vchNo,
      });
      doc.text(fmtAmt(grandDr), colX.debit,  y + 3, { width: colWidths.debit,  align: 'right' });
      doc.text(fmtAmt(grandCr), colX.credit, y + 3, { width: colWidths.credit, align: 'right' });

      doc.end();
      stream.on('finish', () => resolve(tmpPath));
      stream.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  generateTenantLedgerPDF,
  fmtAmt,
  fmtDate,
};
