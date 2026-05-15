require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));
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

async function fetchLiveSchema() {
  try {
    const { data, error } = await supabase.rpc("execute_sql", {
      query: `SELECT table_name, column_name, data_type
              FROM information_schema.columns
              WHERE table_schema = 'public'
              AND table_name IN ('sales','expenses','pending','ledger')
              ORDER BY table_name, ordinal_position`
    });
    if (error || !data) { console.error("[SCHEMA]", error?.message); return; }
    const tables = {};
    data.forEach(r => {
      if (!tables[r.table_name]) tables[r.table_name] = [];
      tables[r.table_name].push(r.column_name + " (" + r.data_type + ")");
    });
    liveSchema = "=== ACTUAL DATABASE COLUMNS ===\n";
    Object.entries(tables).forEach(([tbl, cols]) => {
      liveSchema += "TABLE public." + tbl + ":\n  " + cols.join(", ") + "\n\n";
    });
    console.log("[SCHEMA] Live schema loaded:", Object.keys(tables).join(", "));
  } catch(e) {
    console.error("[SCHEMA] Error:", e.message);
  }
}

async function openai(systemPrompt, messages, maxTokens = 3000) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: maxTokens,
      temperature: 0.1,
      messages: [{ role: "system", content: systemPrompt }, ...messages]
    })
  });
  const d = await response.json();
  if (!response.ok) throw new Error(d.error?.message || JSON.stringify(d));
  return d.choices?.[0]?.message?.content || "";
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

function buildLedgerHTML(info, txns) {
  const openBal  = parseFloat(info.opening_balance) || 0;
  const closeBal = parseFloat(info.closing_balance) || 0;
  const dates    = txns.map(r => r.voucher_date).filter(Boolean).sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
  const lastDate  = dates[dates.length - 1] ? fmtDate(dates[dates.length - 1]) : firstDate;
  const totalDr   = txns.reduce((s, r) => s + (parseFloat(r.voucher_debit) || 0), 0);
  const totalCr   = txns.reduce((s, r) => s + (parseFloat(r.voucher_credit) || 0), 0);
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
      <div style="font-size:13px;font-weight:bold">${info.name}</div>
      <div style="font-size:11px;color:#555;margin-top:2px">Ledger Account — ${firstDate} to ${lastDate}</div>
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
  console.log("\n[SQL]", sql);
  const { data, error } = await supabase.rpc("execute_sql", { query: sql });
  if (error) throw new Error(error.message);
  return data || [];
}

app.get("/history/:sid", async (req, res) => {
  try {
    const { data } = await supabase.from("chat_history")
      .select("role,content,created_at").eq("session_id", req.params.sid)
      .order("created_at", { ascending: true }).limit(50);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

app.delete("/history/:sid", async (req, res) => {
  try { await supabase.from("chat_history").delete().eq("session_id", req.params.sid); } catch(e) {}
  res.json({ ok: true });
});

async function processQuery(userMessage, chatHistory) {
  if (!liveSchema) await fetchLiveSchema();

  const SYSTEM = `You are a smart Sales & Finance Assistant for "Mis Work India Private Limited".
Today: ${new Date().toISOString().split("T")[0]}. Financial year: Apr 2025 – Mar 2026.

${liveSchema}

=== ADDITIONAL SCHEMA NOTES ===
TABLE: public.sales
  category values: 'GOOGLE SHEET - RETAINERSHIP','GOOGLE SHEET - CUSTOM','GOOGLE SHEET - READY',
  'GOOGLE SHEET - AMC','PHP - PANSARI','PHP - OTHERS','WHATSAPP CREDIT','WA Wallet',
  'ERP - CALL SYSTEM','ERP - READY PRODUCTS','MOBILE APP - PANSARI','MOBILE APP - OTHERS','WEB FORM','TALLY'

TABLE: public.expenses
  *** For salary: employee name is in design_number column ***
  sub_group values: 'Salary','OFFICE RENT','Phone and Internet','Technical Exp','Travel Exp',
  'Utility Direc','INSURANCE','Repair & Maintenance','BRANDING EXP','COMMISSION EXP',
  'Stationery','Legal & Prof Exp','Employees Welfare','Financial Exp','Computer Maintenance',
  'Bad Debts','OFFICE EXP','Telephone Exp','Indirect Expenses','Other Expense'

=== CHART DETECTION ===
If user asks for chart/graph/visual/trend/bar/pie/line/doughnut/comparison visual → Return query_type:"chart"

CHART TYPE RULES:
- Monthly trend over time → "line"
- Category comparison / top clients → "bar"  
- Category breakdown/share/split → "doughnut"
- Two things compared monthly → "bar"

chart_config format:
{
  "type": "bar" | "line" | "pie" | "doughnut",
  "title": "Short descriptive title",
  "sql": "SELECT label_col, value_col FROM ... GROUP BY ... ORDER BY ...",
  "label_col": "exact column name for labels",
  "value_col": "exact column name for values"
}

CHART SQL RULES:
- Always 2 columns: one label, one value
- ORDER BY value DESC for bar/pie/doughnut
- ORDER BY month ASC for line
- LIMIT 12 for monthly, LIMIT 10 for categories
- For month: TO_CHAR(date_col,'YYYY-MM') as month

=== LANGUAGE ===
Understand Hindi, Hinglish perfectly:
- salary/salari = sub_group ILIKE '%salary%'
- rent/kiraya = sub_group ILIKE '%rent%'
- ledger/khata = query_type:"ledger"
- is saal = Apr 2025 - Mar 2026

=== NOT BUSINESS RELATED ===
If casual (hello, hi, etc.) → {"query_type": "not_relevant"}

=== RESPONSE FORMAT (JSON only, no markdown) ===
{
  "query_type": "ledger | data | chart | clarify | not_relevant",
  "ledger_search": "company name if ledger",
  "sql": "SELECT ... (only for data queries)",
  "chart_config": { ... },
  "clarify_message": "question if unclear",
  "clarify_options": []
}

=== SQL RULES ===
- Only SELECT statements
- Always LIMIT 5000 unless aggregating
- Use ILIKE for text searches
- ROUND(SUM(amount)::numeric, 0) for amounts
- UPPER(company_name) for grouping to merge duplicates
- All date columns are TIMESTAMP - use TO_CHAR() for grouping
- NON_AMOUNT columns: month, date, period, year, name, category, type, group, sub_group`;

  const messages = [
    ...chatHistory.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const planText = await openai(SYSTEM, messages, 1500);
  const match = planText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON from AI");
  return JSON.parse(match[0]);
}

function buildPivotFromSQL(rows) {
  if (!rows.length || !rows[0].hasOwnProperty("month")) return null;
  const nameCol = rows[0].hasOwnProperty("name") ? "name" :
                  rows[0].hasOwnProperty("category") ? "category" :
                  rows[0].hasOwnProperty("design_number") ? "design_number" : null;
  if (!nameCol) return null;

  const months = [...new Set(rows.map(r => r.month))].sort();
  const pivot = {};
  const rowTotals = {};
  const colTotals = {};
  months.forEach(m => colTotals[m] = 0);

  rows.forEach(r => {
    const name = r[nameCol] || "Other";
    const month = r.month;
    const val = parseFloat(r.total || r.amount || r.total_sales || 0);
    if (!pivot[name]) pivot[name] = {};
    pivot[name][month] = (pivot[name][month] || 0) + val;
    rowTotals[name] = (rowTotals[name] || 0) + val;
    colTotals[month] = (colTotals[month] || 0) + val;
  });

  const sortedNames = Object.entries(rowTotals).sort((a,b) => b[1]-a[1]).map(([n]) => n);
  const grandTotal = Object.values(rowTotals).reduce((s,v) => s+v, 0);

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
    const bg = idx % 2 === 0 ? "#fff" : "#f9f9f9";
    let row = `<tr style="background:${bg}"><td style="${TDL}"><b>${name}</b></td>`;
    months.forEach(m => {
      const val = pivot[name]?.[m] || 0;
      row += `<td style="${TD}">${val > 0 ? fmtAmt(val) : "-"}</td>`;
    });
    row += `<td style="${TOT}">${fmtAmt(rowTotals[name])}</td></tr>`;
    bodyRows += row;
  });

  let grandRow = `<tr><td style="${GRD};text-align:left">Grand Total</td>`;
  months.forEach(m => { grandRow += `<td style="${GRD}">${colTotals[m] > 0 ? fmtAmt(colTotals[m]) : "-"}</td>`; });
  grandRow += `<td style="${GRD};background:#ffc107">${fmtAmt(grandTotal)}</td></tr>`;

  return `<div style="overflow-x:auto;font-family:Arial">
    <table style="border-collapse:collapse;min-width:700px">
      <thead>${header}</thead>
      <tbody>${bodyRows}${grandRow}</tbody>
    </table>
    <div style="font-size:11px;color:#555;margin-top:8px">
      Rows: <b>${sortedNames.length}</b> &nbsp;|&nbsp; Grand Total: <b>${fmtAmt(grandTotal)}</b>
    </div>
  </div>`;
}

function buildTableHTML(rows) {
  if (!rows.length) return "<p style='padding:12px;color:#666'>No data found.</p>";

  const cols = Object.keys(rows[0]);
  const TH = `padding:6px 10px;border:1px solid #444;font-size:12px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;text-align:left;white-space:nowrap`;
  const TD = `padding:5px 8px;border:1px solid #ddd;font-size:12px;font-family:Arial;white-space:nowrap`;

  function parseAnyAmt(v) {
    if (v === null || v === undefined || v === "" || v === "-") return null;
    const s = String(v).replace(/[₹Rs.\s,]/g, "").trim();
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  const NON_AMOUNT_COLS = /phone|mobile|contact|gst|gstin|pan|tan|cin|pin|zip|code|id|no\.?$|num|number|invoice_no|voucher|ref|bill_ref|session|email|address|state|city|name|person|login|description|narration|particular|type|group|category|sub_group|design|month|date|period|year/i;

  const allAmtCols = cols.filter(col => {
    if (NON_AMOUNT_COLS.test(col)) return false;
    if (/^\d+[-–]\d+/i.test(col.trim())) return false;
    const sampleValues = rows.slice(0, 5).map(r => r[col]).filter(v => v !== null && v !== "" && v !== "-");
    if (!sampleValues.length) return false;
    return sampleValues.some(v => {
      const str = String(v).replace(/[₹Rs.\s,]/g, "").trim();
      const num = parseFloat(str);
      if (isNaN(num)) return false;
      if (Number.isInteger(num) && str.length > 10) return false;
      return true;
    });
  });

  const bucketCols = cols.filter(c => /^\d+[-–]\d+/i.test(c.trim()));
  bucketCols.forEach(c => { if (!allAmtCols.includes(c)) allAmtCols.push(c); });

  let header = cols.map(c => `<th style="${TH}">${c.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</th>`).join("");

  let bodyRows = "";
  const colSums = {};
  allAmtCols.forEach(c => colSums[c] = 0);

  rows.forEach((r, i) => {
    const bg = i % 2 === 0 ? "#fff" : "#f9f9f9";
    let row = `<tr style="background:${bg}">`;
    cols.forEach(c => {
      const val = r[c];
      const isAmt = allAmtCols.includes(c);
      if (isAmt) {
        const num = parseAnyAmt(val) || 0;
        colSums[c] = (colSums[c] || 0) + num;
        row += `<td style="${TD};text-align:right">${num > 0 ? fmtAmt(num) : "-"}</td>`;
      } else {
        row += `<td style="${TD}">${val === null || val === "" || val === "NA" ? "-" : val}</td>`;
      }
    });
    row += `</tr>`;
    bodyRows += row;
  });

  let totalRow = "";
  if (allAmtCols.length > 0) {
    totalRow = `<tr style="background:#e0e0e0;font-weight:bold">`;
    cols.forEach((c, idx) => {
      if (idx === 0) {
        totalRow += `<td style="${TD};font-weight:bold">Grand Total</td>`;
      } else if (allAmtCols.includes(c)) {
        totalRow += `<td style="${TD};text-align:right;font-weight:bold">${fmtAmt(colSums[c])}</td>`;
      } else {
        totalRow += `<td style="${TD}"></td>`;
      }
    });
    totalRow += `</tr>`;
  }

  return `<div style="overflow-x:auto;font-family:Arial">
    <table style="border-collapse:collapse;width:100%;min-width:400px">
      <thead><tr>${header}</tr></thead>
      <tbody>${bodyRows}${totalRow}</tbody>
    </table>
    <div style="font-size:11px;color:#555;margin-top:8px">Total Records: <b>${rows.length}</b></div>
  </div>`;
}

async function generateLedgerPDF(info, txns) {
  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `ledger_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);
      const openBal  = parseFloat(info.opening_balance) || 0;
      const closeBal = parseFloat(info.closing_balance) || 0;
      const dates    = txns.map(r => r.voucher_date).filter(Boolean).sort();
      const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
      const lastDate  = dates[dates.length-1] ? fmtDate(dates[dates.length-1]) : firstDate;
      doc.rect(0, 0, doc.page.width, 60).fill("#1a1a2e");
      doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold")
         .text("Mis Work India Private Limited", 30, 14, { align: "center" });
      doc.fontSize(8).font("Helvetica")
         .text("7th Floor, Unit No-775, Aggarwal Millenium Tower 2, Netaji Subhash Place, New Delhi - 110034", 30, 32, { align: "center" });
      doc.fontSize(11).font("Helvetica-Bold").fillColor("#ffffff")
         .text(`Ledger: ${info.name}   |   ${firstDate} to ${lastDate}`, 30, 46, { align: "center" });
      const cols = { date: 30, type: 95, particular: 130, vchType: 310, vchNo: 390, debit: 470, credit: 560 };
      const colW = { date: 60, type: 30, particular: 175, vchType: 75, vchNo: 75, debit: 85, credit: 85 };
      let y = 72;
      doc.rect(30, y, doc.page.width - 60, 16).fill("#333355");
      doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
      doc.text("Date",        cols.date,      y+4, { width: colW.date });
      doc.text("",            cols.type,      y+4, { width: colW.type });
      doc.text("Particulars", cols.particular, y+4, { width: colW.particular });
      doc.text("Vch Type",    cols.vchType,   y+4, { width: colW.vchType });
      doc.text("Vch No.",     cols.vchNo,     y+4, { width: colW.vchNo });
      doc.text("Debit (Rs.)", cols.debit,     y+4, { width: colW.debit, align: "right" });
      doc.text("Credit (Rs.)",cols.credit,    y+4, { width: colW.credit, align: "right" });
      y += 16;
      doc.rect(30, y, doc.page.width-60, 14).fill("#f0f0f0");
      doc.fillColor("#000").fontSize(7).font("Helvetica-Bold");
      doc.text("01-Apr-25",       cols.date,      y+3, { width: colW.date });
      doc.text("To",              cols.type,      y+3, { width: colW.type });
      doc.text("Opening Balance", cols.particular, y+3, { width: colW.particular });
      doc.text("",                cols.vchType,   y+3, { width: colW.vchType });
      doc.text("",                cols.vchNo,     y+3, { width: colW.vchNo });
      doc.text(openBal > 0 ? fmtAmt(openBal) : "", cols.debit,  y+3, { width: colW.debit, align: "right" });
      doc.text(openBal < 0 ? fmtAmt(Math.abs(openBal)) : "", cols.credit, y+3, { width: colW.credit, align: "right" });
      y += 14;
      doc.fontSize(7).font("Helvetica");
      txns.forEach((r, i) => {
        if (y > doc.page.height - 60) { doc.addPage({ layout: "landscape" }); y = 30; }
        const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
        if (i % 2 === 0) doc.rect(30, y, doc.page.width-60, 13).fill("#f9f9f9");
        else doc.rect(30, y, doc.page.width-60, 13).fill("#ffffff");
        doc.fillColor("#000");
        doc.text(fmtDate(r.voucher_date),      cols.date,      y+3, { width: colW.date });
        doc.text(isDr ? "To" : "By",           cols.type,      y+3, { width: colW.type });
        doc.text((r.voucher_particular||"").substring(0,40), cols.particular, y+3, { width: colW.particular });
        doc.text((r.voucher_type||"").substring(0,18),       cols.vchType,   y+3, { width: colW.vchType });
        doc.text((r.voucher_no||"").substring(0,15),         cols.vchNo,     y+3, { width: colW.vchNo });
        doc.text(isDr ? fmtAmt(r.voucher_debit) : "",        cols.debit,     y+3, { width: colW.debit, align: "right" });
        doc.text(!isDr ? fmtAmt(r.voucher_credit) : "",      cols.credit,    y+3, { width: colW.credit, align: "right" });
        y += 13;
      });
      doc.rect(30, y, doc.page.width-60, 14).fill("#e8e8e8");
      doc.fillColor("#000").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Closing Balance", cols.date, y+3, { width: 270 });
      doc.text(closeBal > 0 ? fmtAmt(closeBal) : "",          cols.debit,  y+3, { width: colW.debit, align: "right" });
      doc.text(closeBal < 0 ? fmtAmt(Math.abs(closeBal)) : "", cols.credit, y+3, { width: colW.credit, align: "right" });
      y += 14;
      const totalDr = txns.reduce((s,r) => s+(parseFloat(r.voucher_debit)||0), 0);
      const totalCr = txns.reduce((s,r) => s+(parseFloat(r.voucher_credit)||0), 0);
      const grandDr = totalDr + (openBal > 0 ? openBal : 0);
      const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);
      doc.rect(30, y, doc.page.width-60, 14).fill("#cccccc");
      doc.text("Grand Total", cols.date, y+3, { width: 270 });
      doc.text(fmtAmt(grandDr), cols.debit,  y+3, { width: colW.debit, align: "right" });
      doc.text(fmtAmt(grandCr), cols.credit, y+3, { width: colW.credit, align: "right" });
      y += 20;
      doc.fontSize(7).font("Helvetica").fillColor("#555")
         .text(`Total Transactions: ${txns.length}   |   Net Balance: ${fmtAmt(Math.abs(closeBal))} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}`, 30, y);
      doc.end();
      stream.on("finish", () => { resolve(tmpPath); });
      stream.on("error", reject);
    } catch(e) { reject(e); }
  });
}

async function uploadToSupabase(filePath, mediaType) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName   = path.basename(filePath);
  const bucket     = "mis-media";
  const mimeType   = mediaType === "image" ? "image/png" : "application/pdf";
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, fileBuffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error("Supabase upload failed: " + error.message);
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return urlData?.publicUrl;
}

async function sendWhatsAppMedia(to, filePath, caption, mediaType = "document") {
  const WA_API_KEY = "24c23ac43d6ac2835e2cd16b6a1f2916715921fd173bba82ab";
  const WA_API_URL = "http://app.mis.work/api/v1/message/create";
  const phone = String(to).split("@")[0].replace(/[^0-9]/g, "").replace(/^91/, "");
  try {
    const publicUrl = await uploadToSupabase(filePath, mediaType);
    const msgBody = { receiverMobileNo: phone, filePathUrl: [publicUrl] };
    const resp = await fetch(WA_API_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": WA_API_KEY }, body: JSON.stringify(msgBody) });
    try { fs.unlinkSync(filePath); } catch(e) {}
    const linkMsg = caption + `\n\n📎 *PDF Download:*\n${publicUrl}`;
    await sendWhatsAppReply(phone, linkMsg);
  } catch (e) {
    console.error("[WA MEDIA ERROR]", e.message);
    try { fs.unlinkSync(filePath); } catch(ex) {}
    await sendWhatsAppReply(phone, caption + "\n\n⚠️ File bhejne mein error aaya.");
  }
}

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    if (exactName) {
      const { data } = await supabase.from("ledger")
        .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
        .eq("name", exactName).order("voucher_date", { ascending: true }).limit(500);
      if (data && data.length) {
        const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
        const html = buildLedgerHTML(data[0], txns);
        if (session_id) await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: html }
        ]);
        return res.json({ reply: html, type: "html" });
      }
      return res.json({ reply: `No ledger found for ${exactName}.`, type: "text" });
    }

    let plan;
    try {
      plan = await processQuery(message, history);
      console.log("[PLAN]", JSON.stringify(plan));
    } catch(e) {
      console.error("[PLAN ERROR]", e.message);
      return res.json({ reply: "Could not understand. Please try rephrasing.", type: "text" });
    }

    if (plan.query_type === "not_relevant") {
      return res.json({ reply: "I can only help with MIS Work India sales & finance data.", type: "text" });
    }

    if (plan.query_type === "clarify") {
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: plan.clarify_message }
      ]);
      return res.json({
        reply: plan.clarify_message,
        type: plan.clarify_options?.length ? "suggestions" : "text",
        options: plan.clarify_options || []
      });
    }

    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) return res.json({ reply: "Please tell me the company name.", type: "text" });
      const { data } = await supabase.from("ledger")
        .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
        .ilike("name", `%${search}%`).order("voucher_date", { ascending: true }).limit(2000);
      if (!data || !data.length) return res.json({ reply: `No ledger found for "${search}".`, type: "text" });
      const uniqueNames = [...new Set(data.map(r => r.name))];
      if (uniqueNames.length > 1) {
        if (session_id) await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: "Multiple companies found" }
        ]);
        return res.json({ reply: "Multiple companies found. Which one?", type: "suggestions", options: uniqueNames.slice(0, 8) });
      }
      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const html = buildLedgerHTML(data[0], txns);
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: html }
      ]);
      return res.json({ reply: html, type: "html" });
    }

    // ── CHART QUERY (web) ─────────────────────────────────────────────────────
    if (plan.query_type === "chart" && plan.chart_config) {
      const cfg = plan.chart_config;
      let rows;
      try { rows = await runSQL(cfg.sql); } catch(e) {
        return res.json({ reply: "Chart data error: " + e.message, type: "text" });
      }
      if (!rows || !rows.length) {
        return res.json({ reply: "No data found for this chart.", type: "text" });
      }
      const reply = buildTableHTML(rows);
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: reply }
      ]);
      return res.json({
        reply,
        type: "html",
        chartMeta: {
          chartType: cfg.type,
          title: cfg.title,
          labelCol: cfg.label_col,
          valueCol: cfg.value_col
        }
      });
    }

    if (!plan.sql) {
      return res.json({ reply: "Could not generate a query. Please rephrase.", type: "text" });
    }

    console.log("[SQL]", plan.sql);
    let rows;
    try {
      rows = await runSQL(plan.sql);
    } catch(e) {
      console.error("[SQL ERROR]", e.message);
      return res.json({ reply: `Database error: ${e.message}`, type: "text" });
    }

    if (!rows || !rows.length) {
      const options = ["Show all sales", "Show all expenses", "Show pending payments"];
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: "No data found" }
      ]);
      return res.json({ reply: `No data found for: "${message}"`, type: "suggestions", options });
    }

    const pivotHTML = buildPivotFromSQL(rows);
    const reply = pivotHTML || buildTableHTML(rows);

    if (session_id) await supabase.from("chat_history").insert([
      { session_id, role: "user", content: message },
      { session_id, role: "assistant", content: reply }
    ]);

    return res.json({ reply, type: "html" });

  } catch(err) {
    console.error("[CHAT ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`MIS Chatbot running at http://localhost:${PORT}`);
  await fetchLiveSchema();
});

async function sendWhatsAppReply(to, message) {
  try {
    const WA_API_KEY = "24c23ac43d6ac2835e2cd16b6a1f2916715921fd173bba82ab";
    const WA_API_URL = "http://app.mis.work/api/v1/message/create";
    const phone = String(to).split("@")[0].replace(/[^0-9]/g, "").replace(/^91/, "");
    message = String(message).slice(0, 900);
    await fetch(WA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": WA_API_KEY },
      body: JSON.stringify({ receiverMobileNo: phone, message: [message] })
    });
  } catch(e) {
    console.error("[WHATSAPP REPLY ERROR]", e.message);
  }
}

app.post("/whatsapp", async (req, res) => {
  console.log("\n========== WHATSAPP WEBHOOK ==========");
  try {
    const body = req.body;
    if (body.boundType === "out") return res.json({ success: true, ignored: true });
    const message = body.value || body.message || body.query || body.text || body.Body || body.body ||
      body.data?.message || body.data?.text ||
      (Array.isArray(body.messages) ? body.messages[0]?.text?.body : null) ||
      (Array.isArray(body.messages) ? body.messages[0]?.body : null) ||
      (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body) || "";
    const rawSender = body.senderNumber || body.from || body.From || body.sender || body.phone ||
      body.data?.from || body.data?.sender || body.mobile || "918750285420";
    const actualPhone = String(rawSender).split("@")[0].replace(/[^0-9]/g, "") || "918750285420";
    if (!message) return res.json({ success: false, error: "No message found", received: body });
    const actualQuery = message.trim().replace(/^mis[\s-]?bot\s*/i, "").trim() || message.trim();
    console.log("[WHATSAPP QUERY]", actualQuery, "| FROM:", actualPhone);
    if (!liveSchema) await fetchLiveSchema();
    let plan;
    try { plan = await processQuery(actualQuery, []); }
    catch(e) { return res.json({ success: false, error: e.message }); }
    if (plan.query_type === "not_relevant") {
      console.log("[WHATSAPP IGNORED]", actualQuery);
      return res.json({ success: true, ignored: true });
    }
    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) {
        await sendWhatsAppReply(actualPhone, "Please tell me the company name.");
        return res.json({ success: true });
      }
      const { data } = await supabase.from("ledger")
        .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
        .ilike("name", `%${search}%`).order("voucher_date", { ascending: true }).limit(500);
      if (!data || !data.length) {
        await sendWhatsAppReply(actualPhone, `❌ No ledger found for "${search}"`);
        return res.json({ success: true });
      }
      const uniqueNames = [...new Set(data.map(r => r.name))];
      if (uniqueNames.length > 1) {
        const replyText = "🏢 Multiple companies found:\n" + uniqueNames.slice(0,5).map((n,i) => `${i+1}. ${n}`).join("\n") + "\n\nPlease specify exact name.";
        await sendWhatsAppReply(actualPhone, replyText);
        return res.json({ success: true });
      }
      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const bal = parseFloat(data[0].closing_balance) || 0;
      const companyName = data[0].name;
      const summaryText = `📒 *Ledger: ${companyName}*\n\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "(Dr)" : "(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`;
      await sendWhatsAppReply(actualPhone, summaryText);
      res.json({ success: true, reply: summaryText });
      try {
        const pdfPath = await generateLedgerPDF(data[0], txns);
        const pdfCaption = `📄 *${companyName} — Ledger Statement*\nBalance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "(Dr)" : "(Cr)"}`;
        await sendWhatsAppMedia(actualPhone, pdfPath, pdfCaption, "document");
      } catch(e) {
        console.error("[LEDGER PDF FAILED]", e.message);
        await sendWhatsAppReply(actualPhone, "⚠️ PDF generate karne mein error aaya.");
      }
      return;
    }
    if (plan.query_type === "clarify") {
      await sendWhatsAppReply(actualPhone, "❓ " + plan.clarify_message);
      return res.json({ success: true });
    }
    if (!plan.sql) return res.json({ success: false, error: "Could not generate query" });
    let rows;
    try { rows = await runSQL(plan.sql); }
    catch(e) { return res.json({ success: false, error: "DB error: " + e.message }); }
    if (!rows || !rows.length) {
      await sendWhatsAppReply(actualPhone, `❌ No data found for: "${actualQuery}"`);
      return res.json({ success: true });
    }
    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    const cols = Object.keys(rows[0]);
    const replyLines = rows.slice(0, 10).map((r, i) => {
      const name = r.company_name || r.name || r.design_number || r.party_name || r.invoice_no || r.sub_group || "Item";
      const amountKeys = ["total_sales","total","amount","pending_amount","total_price","salary"];
      const amount = amountKeys.map(k => r[k]).find(v => v != null && v !== "");
      const usedCols = new Set(["company_name","name","design_number","party_name","invoice_no","total_sales","total","amount","pending_amount","total_price"]);
      const extras = cols.filter(c => !usedCols.has(c) && r[c] !== null && r[c] !== "" && r[c] !== "NA").slice(0, 2).map(c => `${c.replace(/_/g," ")}: ${r[c]}`);
      let line = `${emojis[i] || `${i+1}.`} *${name}*`;
      if (amount != null) line += `\n   💰 Rs. ${Number(amount).toLocaleString("en-IN")}`;
      if (extras.length) line += `\n   📌 ${extras.join(" | ")}`;
      return line;
    });
    const replyText = `📊 *Results:*\n\n${replyLines.join("\n\n")}\n\n_Total: ${rows.length} records_`;
    const wpSession = "wp_" + actualPhone;
    await supabase.from("chat_history").insert([
      { session_id: wpSession, role: "user", content: actualQuery },
      { session_id: wpSession, role: "assistant", content: replyText }
    ]);
    res.json({ success: true, reply: replyText, count: rows.length });
    await sendWhatsAppReply(actualPhone, replyText);
  } catch(err) {
    console.error("[WHATSAPP ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/whatsapp", (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "mis_webhook_token";
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.status(403).send("Forbidden");
});

process.on("unhandledRejection", (reason) => { console.error("[UNHANDLED REJECTION]", reason); });
process.on("uncaughtException", (err) => { console.error("[UNCAUGHT EXCEPTION]", err); });
