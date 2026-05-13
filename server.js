require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));

// Service role client — allows AI to run any SQL
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── OPENAI ────────────────────────────────────────────────────────────────────
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

// ── HELPERS ───────────────────────────────────────────────────────────────────
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

// ── LEDGER HTML ───────────────────────────────────────────────────────────────
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

// ── RUN SQL ───────────────────────────────────────────────────────────────────
async function runSQL(sql) {
  const { data, error } = await supabase.rpc("execute_sql", { query: sql });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── CHAT HISTORY ──────────────────────────────────────────────────────────────
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

// ── THE BRAIN: AI generates SQL + formats answer ──────────────────────────────
async function processQuery(userMessage, chatHistory) {

  const SYSTEM = `You are a smart Sales & Finance Assistant for "Mis Work India Private Limited".
Today: ${new Date().toISOString().split("T")[0]}. Financial year: Apr 2025 – Mar 2026.

You have access to a PostgreSQL database. You will:
1. Write a SQL query to get the data
2. Format the result as HTML

=== DATABASE SCHEMA ===

TABLE: public.sales
  id SERIAL, invoice_no TEXT, company_name TEXT, address TEXT, state TEXT,
  gst_no TEXT, contact_person TEXT, phone TEXT, description TEXT,
  total_price NUMERIC, category TEXT, invoice_pdf TEXT, login TEXT,
  created_at TIMESTAMP

  category values: 'GOOGLE SHEET - RETAINERSHIP','GOOGLE SHEET - CUSTOM','GOOGLE SHEET - READY',
  'GOOGLE SHEET - AMC','PHP - PANSARI','PHP - OTHERS','WHATSAPP CREDIT','WA Wallet',
  'ERP - CALL SYSTEM','ERP - READY PRODUCTS','MOBILE APP - PANSARI','MOBILE APP - OTHERS',
  'WEB FORM','TALLY'

TABLE: public.expenses
  id SERIAL, date DATE, voucher_number TEXT, party_name TEXT, group TEXT,
  sub_group TEXT, design_number TEXT, amount NUMERIC, type TEXT

  *** IMPORTANT: For salary entries, employee name is in design_number column ***
  *** party_name is often 'NA' for salary rows ***
  sub_group values: 'Salary','OFFICE RENT','Phone and Internet','Technical Exp','Travel Exp',
  'Utility Direc','INSURANCE','Repair & Maintenance','BRANDING EXP','COMMISSION EXP',
  'Stationery','Legal & Prof Exp','Employees Welfare','Financial Exp','Computer Maintenance',
  'Bad Debts','OFFICE EXP','Telephone Exp','Indirect Expenses','Other Expense'

TABLE: public.pending
  id SERIAL, bill_date DATE, bill_ref_no TEXT, party_name TEXT, party_group TEXT,
  sub_group TEXT, sales_person TEXT, pending_amount TEXT, due_date DATE, overdue_days INT

TABLE: public.ledger
  id SERIAL, name TEXT, subgroup TEXT, "group" TEXT, email TEXT,
  contact_person TEXT, mobile TEXT, opening_balance NUMERIC, closing_balance NUMERIC,
  voucher_date DATE, voucher_particular TEXT, voucher_type TEXT, voucher_no TEXT,
  voucher_debit NUMERIC, voucher_credit NUMERIC

TABLE: public.chat_history
  id SERIAL, session_id TEXT, role TEXT, content TEXT, created_at TIMESTAMP

=== LANGUAGE UNDERSTANDING ===
Understand Hindi, Hinglish, typos perfectly:
- client/customer/party/company = company_name in sales, name in ledger, party_name in pending
- salary/salari/tankhwa = sub_group = 'Salary' in expenses (employee name in design_number)
- lgdr/ldgr/khata = ONLY use query_type:"ledger" for explicit ledger/statement/khata requests
- dikhao/batao/show/de/dedo = show/display
- is saal = this year = Apr 2025 - Mar 2026
- pichle saal/last year = Apr 2024 - Mar 2025
- rent/kiraya = sub_group = 'OFFICE RENT'

=== PERSON NAME SEARCH (CRITICAL) ===
When user mentions a PERSON NAME (like "Deepankar ji", "Shammi ji", "Ankur"):
- Search sales table using contact_person or login column
- NEVER use query_type:"ledger" for person searches
- Always use DISTINCT ON (gst_no) to avoid duplicate company entries
- "Deepankar ji ka address/GST/details":
  SELECT DISTINCT ON (gst_no) company_name, address, state, gst_no, contact_person, phone
  FROM sales WHERE contact_person ILIKE '%Deepankar%'
  ORDER BY gst_no, created_at DESC

=== GST / BILLING DETAILS ===
For GST details, address, billing info → always use sales table:
- Columns: gst_no, company_name, address, state, contact_person, phone
- ALWAYS use DISTINCT ON (gst_no) to get one record per unique company
- "GST details of X":
  SELECT DISTINCT ON (gst_no) company_name, address, state, gst_no, contact_person, phone
  FROM sales WHERE company_name ILIKE '%X%'
  ORDER BY gst_no, created_at DESC
- If no gst_no: use DISTINCT ON (company_name)

=== WHEN TO USE LEDGER (query_type:"ledger") ===
ONLY when user explicitly says: ledger / lgdr / khata / statement / account statement
For a COMPANY transaction history. NEVER for contact/GST/address queries.

=== YOUR RESPONSE FORMAT ===
Return ONLY this JSON (no markdown):
{
  "query_type": "ledger | data | clarify",
  "ledger_search": "company name if ledger query",
  "sql": "SELECT ... (only for data queries, read-only SELECT)",
  "clarify_message": "question if unclear",
  "clarify_options": []
}

=== SQL RULES ===
- Only SELECT statements (never INSERT/UPDATE/DELETE)
- Always LIMIT 5000 unless aggregating
- For pivot/monthly: use DATE_TRUNC('month', date_col) or TO_CHAR(date_col,'YYYY-MM')
- For salary pivot: GROUP BY design_number, TO_CHAR(date,'YYYY-MM')
- For amounts: ROUND(SUM(amount)::numeric, 0)
- Escape single quotes properly
- Use ILIKE for text searches (case insensitive)
- For "top N": use ORDER BY total DESC LIMIT N

=== SQL EXAMPLES ===
"team member wise salary apr 2025 to mar 2026 pivot":
SELECT design_number as name, TO_CHAR(date,'YYYY-MM') as month, ROUND(SUM(amount)::numeric,0) as total
FROM expenses WHERE sub_group='Salary' AND date >= '2025-04-01' AND date <= '2026-03-31'
AND design_number != '' AND design_number IS NOT NULL
GROUP BY design_number, TO_CHAR(date,'YYYY-MM') ORDER BY design_number, month

"top 5 clients by sales":
SELECT company_name, phone, contact_person, ROUND(SUM(total_price)::numeric,0) as total_sales
FROM sales WHERE total_price > 0 GROUP BY company_name, phone, contact_person
ORDER BY total_sales DESC LIMIT 5

"category wise month wise sales apr 25 to mar 26":
SELECT category, TO_CHAR(created_at,'YYYY-MM') as month, ROUND(SUM(total_price)::numeric,0) as total
FROM sales WHERE created_at >= '2025-04-01' AND created_at <= '2026-03-31' AND total_price > 0
GROUP BY category, TO_CHAR(created_at,'YYYY-MM') ORDER BY category, month

"60-90 days pending":
SELECT party_name, bill_ref_no, ROUND(REGEXP_REPLACE(pending_amount,'[^0-9.]','','g')::numeric,0) as pending_amount, overdue_days FROM pending
WHERE overdue_days >= 60 AND overdue_days <= 90 ORDER BY overdue_days DESC

"client wise aging pending (0-30, 31-60, 61-90, 91-120 days buckets)":
SELECT party_name,
  ROUND(SUM(CASE WHEN overdue_days <= 30 THEN REGEXP_REPLACE(pending_amount,'[^0-9.]','','g')::numeric ELSE 0 END),0) as "0-30 Days",
  ROUND(SUM(CASE WHEN overdue_days BETWEEN 31 AND 60 THEN REGEXP_REPLACE(pending_amount,'[^0-9.]','','g')::numeric ELSE 0 END),0) as "31-60 Days",
  ROUND(SUM(CASE WHEN overdue_days BETWEEN 61 AND 90 THEN REGEXP_REPLACE(pending_amount,'[^0-9.]','','g')::numeric ELSE 0 END),0) as "61-90 Days",
  ROUND(SUM(CASE WHEN overdue_days BETWEEN 91 AND 120 THEN REGEXP_REPLACE(pending_amount,'[^0-9.]','','g')::numeric ELSE 0 END),0) as "91-120 Days"
FROM pending GROUP BY party_name
HAVING SUM(REGEXP_REPLACE(pending_amount,'[^0-9.]','','g')::numeric) > 0
ORDER BY party_name

"salary + rent + travel total":
SELECT sub_group, ROUND(SUM(amount)::numeric,0) as total FROM expenses
WHERE sub_group IN ('Salary','OFFICE RENT','Travel Exp') GROUP BY sub_group ORDER BY total DESC

"clients with no invoice this year but had last year":
SELECT ly.company_name, ROUND(SUM(ly.total_price)::numeric,0) as last_year_revenue
FROM sales ly WHERE ly.created_at >= '2024-04-01' AND ly.created_at < '2025-04-01'
AND ly.company_name NOT IN (
  SELECT DISTINCT company_name FROM sales
  WHERE created_at >= '2025-04-01' AND created_at < '2026-04-01'
)
GROUP BY ly.company_name ORDER BY last_year_revenue DESC

"list all clients":
SELECT DISTINCT company_name, phone, contact_person FROM sales ORDER BY company_name LIMIT 500
`;

  const messages = [
    ...chatHistory.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const planText = await openai(SYSTEM, messages, 1500);
  const match = planText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON from AI");
  return JSON.parse(match[0]);
}

// ── BUILD PIVOT FROM RAW DATA ─────────────────────────────────────────────────
function buildPivotFromSQL(rows) {
  // Detect if this is pivot data (has 'month' column)
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

// ── BUILD REGULAR TABLE FROM SQL DATA ────────────────────────────────────────
function buildTableHTML(rows) {
  if (!rows.length) return "<p style='padding:12px;color:#666'>No data found.</p>";

  const cols = Object.keys(rows[0]);
  const TH = `padding:6px 10px;border:1px solid #444;font-size:12px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;text-align:left;white-space:nowrap`;
  const TD = `padding:5px 8px;border:1px solid #ddd;font-size:12px;font-family:Arial;white-space:nowrap`;

  // Parse any amount string (handles "₹1,090", "Rs. 1,090", "1090", 1090)
  function parseAnyAmt(v) {
    if (v === null || v === undefined || v === "" || v === "-") return null;
    const s = String(v).replace(/[₹Rs.\s,]/g, "").trim();
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  // Smart amount detection:
  // 1. Never format phone/mobile/contact/id/code/number/gst/pin/zip columns
  // 2. Never format columns where values are too long (phone numbers > 12 digits)
  // 3. Format everything else that looks like a money value

  const NON_AMOUNT_COLS = /phone|mobile|contact|gst|gstin|pan|tan|cin|pin|zip|code|id|no\.?$|num|number|invoice_no|voucher|ref|bill_ref|session|email|address|state|city|name|person|login|description|narration|particular|type|group|category|sub_group|design/i;

  const allAmtCols = cols.filter(col => {
    // Skip obviously non-money columns by name
    if (NON_AMOUNT_COLS.test(col)) return false;

    // Skip day-bucket columns — handle separately
    if (/^\d+[-–]\d+/i.test(col.trim())) return false;

    // Check actual values — if numeric and reasonable length → it's money
    const sampleValues = rows.slice(0, 5).map(r => r[col]).filter(v => v !== null && v !== "" && v !== "-");
    if (!sampleValues.length) return false;

    return sampleValues.some(v => {
      const str = String(v).replace(/[₹Rs.\s,]/g, "").trim();
      // Money: numeric, not too long (phone numbers are 10+ digits without decimals)
      const num = parseFloat(str);
      if (isNaN(num)) return false;
      // If it's a whole number with more than 10 digits → probably phone number
      if (Number.isInteger(num) && str.length > 10) return false;
      return true;
    });
  });

  // Day-bucket columns also get amount formatting
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

  // Grand total row
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

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    // Suggestion click → ledger
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

    // AI decides what to do
    let plan;
    try {
      plan = await processQuery(message, history);
      console.log("[PLAN]", JSON.stringify(plan));
    } catch(e) {
      console.error("[PLAN ERROR]", e.message);
      return res.json({ reply: "Could not understand. Please try rephrasing.", type: "text" });
    }

    // Clarification needed
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

    // Ledger
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

    // Data query — run SQL
    if (!plan.sql) {
      return res.json({ reply: "Could not generate a query. Please rephrase.", type: "text" });
    }

    console.log("[SQL]", plan.sql);
    let rows;
    try {
      rows = await runSQL(plan.sql);
    } catch(e) {
      console.error("[SQL ERROR]", e.message);
      // Try fallback with Supabase client
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

    // Build HTML — pivot or regular table
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
app.listen(PORT, () => console.log(`MIS Chatbot (AI-SQL) running at http://localhost:${PORT}`));