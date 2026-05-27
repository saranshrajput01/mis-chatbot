// Heavy fake data injection: 20-26 May 2026
// Both SALES + PURCHASES tabs. Continues real voucher number sequence.
// Run: node scripts/inject-fake-data.js
'use strict';
require('dotenv').config();
const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = '1HYXoLNsg0lYkmqhBLUBnFbyEatmVfM8SHcbk7YxNPrw';
const KEY = path.join(__dirname, '..', 'logical-craft-438704-n8-d0d8ae886a53.json');

const TARGET_DATES = [
  '20-May-26', '21-May-26', '22-May-26', '23-May-26',
  '24-May-26', '25-May-26', '26-May-26'
];

// ── Realism pools (curated from real data analysis) ──────────────────────────
const SALES_PARTIES = [
  'Insulators & Electricals Company',
  'NPL Buildcon LLP',
  'Bharat Heavy Electricals Limited',
  'MITTAL ELECTRONICS',
  'Saga Stainox Private Limited',
  'FELIX HEALTHCARE PRIVATE LIMITED-(T1)',
  'Felix Healthcare Private Limited (Gamma)',
  'AESTHETIC PRINTING AND BRUSHES PRIVATE LIMITED',
  'AJIT INDUSTRIES WEST PVT.LTD.',
  'KIRAN UDYOG'
];
const SALES_ITEMS = [
  { name: 'Supply of MS Structure (730890)',                hsn: '73089090', gstPct: 18 },
  { name: 'BOILER COMPONENTS',                              hsn: '840290',   gstPct: 18 },
  { name: 'IRON AND STEEL (721049)',                        hsn: '721049',   gstPct: 18 },
  { name: 'Civil & Boundry Work  Received/Receivable',      hsn: '995464',   gstPct: 18 },
  { name: 'Foundation Bolt/Hardware /Sag Rod(731815)',      hsn: '73181500', gstPct: 18 },
  { name: 'GL COIL  (721061)',                              hsn: '721061',   gstPct: 18 },
  { name: 'MS Plate (722540)',                              hsn: '722540',   gstPct: 18 },
  { name: 'Structural Fabrication',                         hsn: '73089090', gstPct: 18 }
];
const SALES_CITIES = ['RAISEN','Mirzapur','SONEPAT','Gohana','JHAJJAR','Singrauli','NOIDA','Yamunanagar','BHUJ','LUCKNOW','GURUGRAM'];
const SALES_INV_TYPES = ['GST INVOICE (Purkhas)', 'GST INVOICE (Kailana)'];

const PURCH_PARTIES = [
  'DIVYA GASES',
  'CLASSIC  INDUSTRIES',
  'Mahawar Iron Stores Pvt Ltd',
  'Sun International',
  'Bishamber Fastners',
  'AJAY Metalloys Pvt. Ltd',
  'V.K. Gases',
  'ASIAN PAINTS PPG PVT. LTD (UP)',
  'SHRI RAM HARDWARE STORE',
  'MAHARAJA STEEL CORP'
];
const PURCH_ITEMS = [
  'H.R. Coil/Plate ( 7208)',
  'LPG/Oxygen Refilling Charges',
  'M.S. Angle/Channel/Beam',
  'Welding Electrodes',
  'Paint & Primer',
  'Hardware & Fasteners',
  'INPUT IGST 18%',
  'Cutting Tool & Consumables'
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function r(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr)   { return arr[Math.floor(Math.random() * arr.length)]; }

// Realistic amount distribution (log-normal-ish): ~p25=15K, p50=80K, p75=4L, p95=15L
function realisticSalesAmount() {
  const tier = Math.random();
  if (tier < 0.20) return r(8000, 50000);             // small invoices
  if (tier < 0.50) return r(50000, 250000);           // mid
  if (tier < 0.80) return r(250000, 800000);          // large
  if (tier < 0.95) return r(800000, 2200000);         // very large
  return r(2200000, 6500000);                         // mega
}
function realisticPurchaseAmount() {
  const tier = Math.random();
  if (tier < 0.30) return r(1500, 12000);
  if (tier < 0.60) return r(12000, 60000);
  if (tier < 0.85) return r(60000, 250000);
  if (tier < 0.95) return r(250000, 700000);
  return r(700000, 1800000);
}

function todayTimestamp() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mn}`;
}

function fmtMoney(n) {
  // "X,XX,XXX.YY" Indian format
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── SALES row (28 cols) ──────────────────────────────────────────────────────
// Cols: TIMESTAMP, Date, Voucher_Numbe, VoucherType, Party, SalesPerson, Ewaybill, IRNNUM, ACKNUM, ACKDATE,
//       CITY, InvType, Item_Name, Qty, Unit, Rate, Amount, HSNCODE, CGST, SGST, IGST, TypeOfRef, BillRefNo,
//       CreditDays, WITH_GST_Amount, "", CONTAIN, (script-url-blank)
function buildSalesRow(voucher, dateStr) {
  const ts = todayTimestamp();
  const party = pick(SALES_PARTIES);
  const item = pick(SALES_ITEMS);
  const city = pick(SALES_CITIES);
  const invType = pick(SALES_INV_TYPES);
  const amount = realisticSalesAmount();
  const qty = r(1, 50);
  const rate = +(amount / qty).toFixed(2);
  // GST split — 50% chance IGST (interstate), else CGST+SGST
  const useIgst = Math.random() < 0.55;
  const cgst = useIgst ? 0 : +(amount * 0.09).toFixed(2);
  const sgst = useIgst ? 0 : +(amount * 0.09).toFixed(2);
  const igst = useIgst ? +(amount * (item.gstPct / 100)).toFixed(2) : 0;
  const withGst = +(amount + cgst + sgst + igst).toFixed(2);
  return [
    ts,                              // TIMESTAMP
    dateStr,                         // Date
    `${voucher}/2026-27`,            // Voucher_Numbe
    invType,                         // Voucher Type
    party,                           // Party_Name
    'NA',                            // Sales Person Name
    'NA',                            // Ewaybillnum
    'NA',                            // IRNNUM
    'NA',                            // ACKNUM
    'NA',                            // ACKDATE
    city,                            // CITY
    'NA',                            // InvType
    item.name,                       // Item_Name
    qty,                             // Qty
    'NOS',                           // Unit
    rate,                            // Rate
    amount,                          // Amount
    item.hsn,                        // HSNCODE
    cgst,                            // CGST
    sgst,                            // SGST
    igst,                            // IGST
    'New Ref',                       // Type of Ref
    `${voucher}/2026-27`,            // Bill Ref No
    'NA',                            // Credit Days
    fmtMoney(withGst),               // WITH GST Amount
    '',                              // (blank col 26)
    'Y'                              // CONTAIN
  ];
}

// ── PURCHASES row (29 cols visible — original sheet has 32 with header padding) ─
// Cols: TIMESTAMP, VchNo, SupplierNo, Date, City, District, PartyName, Alias, TaxableAmount, InvoiceAmount,
//       TCS, CD_RECEIVED, PaymentDate, Ewaybillnum, EwaybillDate, Transport_Name, PONo, Item_Name, part_no,
//       CD%, Qty, Unit, Price, Discount, Amount, HSNCODE, CGST, SGST, IGST
function buildPurchaseRow(voucherNum, dateStr) {
  const ts = todayTimestamp();
  const vchNo = `SRH/26-27/${String(voucherNum).padStart(4, '0')}`;
  const party = pick(PURCH_PARTIES);
  const item = pick(PURCH_ITEMS);
  const amount = realisticPurchaseAmount();
  const taxable = amount;
  const useIgst = Math.random() < 0.4;
  const cgst = useIgst ? 0 : +(amount * 0.09).toFixed(2);
  const sgst = useIgst ? 0 : +(amount * 0.09).toFixed(2);
  const igst = useIgst ? +(amount * 0.18).toFixed(2) : 0;
  const invoiceAmount = +(taxable + cgst + sgst + igst).toFixed(2);
  const qty = r(1, 100);
  const price = +(amount / qty).toFixed(2);
  return [
    ts,                              // TIMESTAMP
    vchNo,                           // VchNo
    'NA',                            // Supplier No
    dateStr,                         // Date
    'NA',                            // City
    'NA',                            // District
    party,                           // PartyName
    'NA',                            // Alias
    taxable,                         // TaxableAmount
    invoiceAmount,                   // InvoiceAmount
    0,                               // TCS
    0,                               // CD_RECEIVED
    'NA',                            // PaymentDate
    'NA',                            // Ewaybillnum
    'NA',                            // EwaybillDate
    'NA',                            // Transport_Name
    'NA',                            // PONo
    item,                            // Item_Name
    'NA',                            // part_no
    0,                               // CD%
    qty,                             // Qty
    'NOS',                           // Unit
    price,                           // Price
    0,                               // Discount
    amount,                          // Amount
    '73089090',                      // HSNCODE
    cgst,                            // CGST
    sgst,                            // SGST
    igst                             // IGST
  ];
}

// ── Volume profile per day (heavy) ──
const SALES_PER_DAY = {
  '20-May-26': 28, '21-May-26': 22, '22-May-26': 36, '23-May-26': 26,
  '24-May-26': 31, '25-May-26': 19, '26-May-26': 33
};
const PURCH_PER_DAY = {
  '20-May-26': 18, '21-May-26': 14, '22-May-26': 22, '23-May-26': 16,
  '24-May-26': 20, '25-May-26': 12, '26-May-26': 21
};

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Build all sales rows — voucher numbers continue from 277
  const salesRows = [];
  let voucher = 277;
  let salesTotalsByDay = {};
  for (const date of TARGET_DATES) {
    const n = SALES_PER_DAY[date];
    for (let i = 0; i < n; i++) {
      const row = buildSalesRow(voucher++, date);
      salesRows.push(row);
      salesTotalsByDay[date] = (salesTotalsByDay[date] || 0) + Number(row[16]);
    }
  }

  // Build all purchase rows — VchNo continues from 1340
  const purchRows = [];
  let pVoucher = 1340;
  let purchTotalsByDay = {};
  for (const date of TARGET_DATES) {
    const n = PURCH_PER_DAY[date];
    for (let i = 0; i < n; i++) {
      const row = buildPurchaseRow(pVoucher++, date);
      purchRows.push(row);
      purchTotalsByDay[date] = (purchTotalsByDay[date] || 0) + Number(row[24]);
    }
  }

  console.log('=== Generated ===');
  console.log('SALES rows:', salesRows.length, '(vouchers 277-' + (voucher - 1) + ')');
  for (const d of TARGET_DATES) {
    console.log('  ' + d + ': ' + SALES_PER_DAY[d] + ' invoices, ₹' + (salesTotalsByDay[d] / 1e7).toFixed(2) + ' Cr');
  }
  console.log('PURCHASES rows:', purchRows.length, '(SRH/26-27/1340-' + (pVoucher - 1) + ')');
  for (const d of TARGET_DATES) {
    console.log('  ' + d + ': ' + PURCH_PER_DAY[d] + ' entries, ₹' + (purchTotalsByDay[d] / 1e7).toFixed(2) + ' Cr');
  }

  // ── Append to SALES tab ──
  console.log('\n→ Appending to SALES tab…');
  const sResp = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'SALES!A:AB',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: salesRows }
  });
  console.log('  ✓ Updated range:', sResp.data.updates.updatedRange, '— rows:', sResp.data.updates.updatedRows);

  // ── Append to PURCHASES tab ──
  console.log('\n→ Appending to PURCHASES tab…');
  const pResp = await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'PURCHASES!A:AC',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: purchRows }
  });
  console.log('  ✓ Updated range:', pResp.data.updates.updatedRange, '— rows:', pResp.data.updates.updatedRows);

  console.log('\n=== Sheet write done. Now triggering sync… ===');
}

main().catch(e => { console.error('FATAL:', e.message); console.error(e.stack); process.exit(1); });
