require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── OPENAI HELPER ─────────────────────────────────────────────────────────────
async function openai(systemPrompt, messages, maxTokens = 2000) {
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

// ── DATABASE SCHEMA ───────────────────────────────────────────────────────────
function getSchema() {
  return `
You are a smart Sales & Finance Assistant for "Mis Work India Private Limited".
Today's date: ${new Date().toISOString().split("T")[0]}
Current financial year: April 2025 to March 2026 (2026-03-31 is the last day)

SYNONYM MAPPINGS:
- client = customer = party = company = client name = party name
- show = dikhao = batao = de = dedo = dikha = share = give = bta
- ledger = lgdr = ldgr = khata
- invoice = bill = invois
- salary = salari = tankhwa = wages
- rent = kiraya = office rent
- expense = kharcha = kharch = cost
- pending = baaki = baki = overdue
- team member = employee = staff = party_name in expenses table

DATABASE TABLES:

=== TABLE: sales ===
- created_at (timestamp)   → invoice date
- invoice_no (text)        → e.g. "MIS-24-25-123"
- company_name (text)      → CLIENT/customer name
- address, state, gst_no, contact_person, phone (text)
- description (text)       → work description
- total_price (numeric)    → invoice amount
- category (text)          → product/service type
- invoice_pdf (text)       → PDF URL
- login (text)             → salesperson

Categories: "GOOGLE SHEET - RETAINERSHIP","GOOGLE SHEET - CUSTOM","GOOGLE SHEET - READY",
"GOOGLE SHEET - AMC","PHP - PANSARI","PHP - OTHERS","WHATSAPP CREDIT","WA Wallet",
"ERP - CALL SYSTEM","ERP - READY PRODUCTS","MOBILE APP - PANSARI","MOBILE APP - OTHERS",
"WEB FORM","TALLY"

=== TABLE: expenses ===
- date (date)              → expense date
- voucher_number (int)
- party_name (text)        → *** THIS IS THE TEAM MEMBER / EMPLOYEE NAME for salary entries ***
                             *** ALWAYS fetch party_name when user asks about team members ***
- group (text)             → main group
- sub_group (text)         → expense category (e.g. "Salary")
- design_number (text)     → description/narration
- amount (numeric)         → Rs.
- type (text)              → "Dr" or "Cr"

Sub_groups: "Salary","OFFICE RENT","Phone and Internet","Technical Exp","Travel Exp",
"Utility Direc","INSURANCE","Repair & Maintenance","BRANDING EXP","COMMISSION EXP",
"Stationery","Legal & Prof Exp","Employees Welfare","Financial Exp","Computer Maintenance",
"Bad Debts","Factory Related","OFFICE EXP","Telephone Exp","Indirect Expenses","Other Expense"

=== TABLE: pending ===
- bill_date, bill_ref_no, party_name, party_group, sub_group, sales_person (text)
- pending_amount (text)    → "₹1,090" format
- due_date (date), overdue_days (int)

=== TABLE: ledger ===
- name (text)              → company name
- subgroup, group, email, contact_person, mobile (text)
- opening_balance, closing_balance (numeric)
- voucher_date (date), voucher_particular, voucher_type, voucher_no (text)
- voucher_debit, voucher_credit (numeric)
`;
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
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return String(dt.getDate()).padStart(2,"0") + "-" + months[dt.getMonth()] + "-" + String(dt.getFullYear()).slice(2);
}

function fmtMonth(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return months[parseInt(m) - 1] + "-" + String(y).slice(2);
}

// ── LEDGER HTML BUILDER ───────────────────────────────────────────────────────
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

  let rows = `<tr>
    <td style="${TD};white-space:nowrap"><b>01-Apr-25</b></td>
    <td style="${TD}"><b>To</b></td>
    <td style="${TD}" colspan="3"><b>Opening Balance</b></td>
    <td style="${TD};text-align:right"><b>${openBal > 0 ? fmtAmt(openBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${openBal < 0 ? fmtAmt(Math.abs(openBal)) : ""}</b></td>
  </tr>`;

  txns.forEach((r, i) => {
    const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
    const bg = i % 2 === 0 ? "#fff" : "#f9f9f9";
    rows += `<tr style="background:${bg}">
      <td style="${TD};white-space:nowrap">${fmtDate(r.voucher_date)}</td>
      <td style="${TD}">${isDr ? "To" : "By"}</td>
      <td style="${TD}">${r.voucher_particular || ""}</td>
      <td style="${TD}">${r.voucher_type || ""}</td>
      <td style="${TD};font-family:monospace">${r.voucher_no || ""}</td>
      <td style="${TD};text-align:right">${isDr ? fmtAmt(r.voucher_debit) : ""}</td>
      <td style="${TD};text-align:right">${!isDr ? fmtAmt(r.voucher_credit) : ""}</td>
    </tr>`;
  });

  const grandDr = totalDr + (openBal > 0 ? openBal : 0);
  const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

  rows += `<tr style="background:#f0f0f0">
    <td style="${TD}" colspan="5"><b>Closing Balance</b></td>
    <td style="${TD};text-align:right"><b>${closeBal > 0 ? fmtAmt(closeBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${closeBal < 0 ? fmtAmt(Math.abs(closeBal)) : ""}</b></td>
  </tr>
  <tr style="background:#ddd">
    <td style="${TD}" colspan="5"><b>Grand Total</b></td>
    <td style="${TD};text-align:right"><b>${fmtAmt(grandDr)}</b></td>
    <td style="${TD};text-align:right"><b>${fmtAmt(grandCr)}</b></td>
  </tr>`;

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
      <span>Net Balance: <b>${fmtAmt(Math.abs(closeBal))} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}</b></span>
    </div>
  </div>`;
}

// ── PIVOT TABLE BUILDER (server-side, guaranteed correct) ─────────────────────
function buildPivotHTML(data, rowField, valField, months) {
  // Group data
  const pivot = {};
  const rowTotals = {};
  const colTotals = {};
  months.forEach(m => colTotals[m] = 0);

  data.forEach(r => {
    const rowKey = r[rowField] || "Unknown";
    // Get month from date field
    const dateVal = r.date || r.created_at || "";
    const month = String(dateVal).substring(0, 7); // YYYY-MM

    if (!pivot[rowKey]) pivot[rowKey] = {};
    pivot[rowKey][month] = (pivot[rowKey][month] || 0) + (parseFloat(r[valField]) || 0);
    rowTotals[rowKey] = (rowTotals[rowKey] || 0) + (parseFloat(r[valField]) || 0);
    if (months.includes(month)) colTotals[month] = (colTotals[month] || 0) + (parseFloat(r[valField]) || 0);
  });

  // Sort rows by total desc, filter out zero rows
  const sortedRows = Object.entries(rowTotals)
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  if (!sortedRows.length) return "<p>No data found.</p>";

  const TH = `padding:8px 12px;border:1px solid #444;font-size:11px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;white-space:nowrap;text-align:center`;
  const THL = `padding:8px 12px;border:1px solid #444;font-size:11px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;text-align:left`;
  const TD = `padding:7px 10px;border:1px solid #ddd;font-size:11px;font-family:Arial;text-align:right;white-space:nowrap`;
  const TDL = `padding:7px 10px;border:1px solid #ddd;font-size:11px;font-family:Arial;text-align:left;white-space:nowrap`;
  const TDTOT = `padding:7px 10px;border:1px solid #ddd;font-size:11px;font-family:Arial;text-align:right;white-space:nowrap;background:#fff3cd;font-weight:bold`;
  const TDGRAND = `padding:7px 10px;border:1px solid #bbb;font-size:11px;font-family:Arial;text-align:right;white-space:nowrap;background:#e0e0e0;font-weight:bold`;

  // Header
  let header = `<tr><th style="${THL}">Team Member / Party</th>`;
  months.forEach(m => { header += `<th style="${TH}">${fmtMonth(m)}</th>`; });
  header += `<th style="${TH};background:#333">Total</th></tr>`;

  // Rows
  let rows = "";
  sortedRows.forEach((name, idx) => {
    const bg = idx % 2 === 0 ? "#fff" : "#f9f9f9";
    let row = `<tr style="background:${bg}"><td style="${TDL}"><b>${name}</b></td>`;
    months.forEach(m => {
      const val = pivot[name]?.[m] || 0;
      row += `<td style="${TD}">${val > 0 ? fmtAmt(val) : "-"}</td>`;
    });
    row += `<td style="${TDTOT}">${fmtAmt(rowTotals[name])}</td></tr>`;
    rows += row;
  });

  // Grand Total row
  const grandTotal = Object.values(rowTotals).reduce((s, v) => s + v, 0);
  let grandRow = `<tr><td style="${TDGRAND};text-align:left">Grand Total</td>`;
  months.forEach(m => {
    grandRow += `<td style="${TDGRAND}">${colTotals[m] > 0 ? fmtAmt(colTotals[m]) : "-"}</td>`;
  });
  grandRow += `<td style="${TDGRAND};background:#ffc107">${fmtAmt(grandTotal)}</td></tr>`;

  return `<div style="overflow-x:auto;font-family:Arial">
    <table style="border-collapse:collapse;min-width:900px">
      <thead>${header}</thead>
      <tbody>${rows}${grandRow}</tbody>
    </table>
    <div style="font-size:11px;color:#555;margin-top:6px;padding:4px">
      Total Records: <b>${data.length}</b> &nbsp;|&nbsp; Grand Total: <b>${fmtAmt(grandTotal)}</b>
    </div>
  </div>`;
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

// ── STEP 1: AI PLAN ───────────────────────────────────────────────────────────
async function aiPlan(userMessage, chatHistory) {
  const planPrompt = `${getSchema()}

YOUR TASK: Analyze the user's message (using conversation history for context) and return a JSON query plan.
Return ONLY raw JSON — no markdown, no explanation.

CRITICAL RULES:
1. For salary/team member pivot → expenses table, sub_group:["Salary"], select MUST include "party_name,date,amount"
2. For ANY pivot table → always set date_gte and date_lte. Default full year: 2025-04-01 to 2026-03-31
3. "last year" = 2024-04-01 to 2025-03-31, "this year" = 2025-04-01 to 2026-03-31
4. NEVER add gt_total_price filter unless explicitly asked
5. For "list all clients" → sales table, select:"company_name,created_at", no price filter
6. Use conversation history for follow-up questions

JSON format:
{
  "intent": "description",
  "needs_clarification": false,
  "clarification_question": "",
  "clarification_options": [],
  "response_format": "pivot_table | ledger | table | list | text",
  "ledger_search": "",
  "pivot_months": ["2025-04","2025-05","2025-06","2025-07","2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"],
  "pivot_row_field": "party_name",
  "pivot_val_field": "amount",
  "queries": [
    {
      "table": "sales|expenses|pending|ledger",
      "select": "*",
      "filters": {
        "date_gte": "2025-04-01",
        "date_lte": "2026-03-31",
        "in_sub_group": ["Salary"]
      },
      "order_by": "date",
      "order_asc": true,
      "limit": 5000,
      "purpose": "salary_pivot"
    }
  ]
}

Filter keys:
  date_gte, date_lte         → date range (always set for pivot queries)
  ilike_name                 → ledger name search
  ilike_company_name         → sales company_name search
  ilike_party_name           → expenses/pending party search
  in_sub_group               → array of sub_group values
  in_category                → array of category values
  gt_total_price             → only use when explicitly needed
  gte_overdue_days, lte_overdue_days → pending filters

EXAMPLES:
- "team member wise salary apr 2025" → expenses, in_sub_group:["Salary"], date_gte:"2025-04-01", date_lte:"2026-03-31", select:"party_name,date,amount", response_format:"pivot_table", pivot_row_field:"party_name", pivot_val_field:"amount"
- "list all clients" → sales, select:"company_name,created_at", no filters
- "top 5 clients by sales" → sales, select:"company_name,total_price,category", order_by:"total_price"
- "category wise month pivot" → sales, select:"category,created_at,total_price", date range, response_format:"pivot_table", pivot_row_field:"category", pivot_val_field:"total_price"
- "pansri ka ledger" → response_format:"ledger", ledger_search:"pansari"
`;

  const messages = [
    ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const text = await openai(planPrompt, messages, 1000);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in plan");
  return JSON.parse(match[0]);
}

// ── STEP 2: RUN QUERIES ───────────────────────────────────────────────────────
async function runQueries(plan) {
  const results = [];
  const dateColMap = { sales: "created_at", expenses: "date", pending: "due_date", ledger: "voucher_date" };

  for (const q of plan.queries) {
    let query = supabase.from(q.table).select(q.select || "*");
    const f = q.filters || {};
    const dc = dateColMap[q.table] || "created_at";

    if (f.date_gte)           query = query.gte(dc, f.date_gte);
    if (f.date_lte)           query = query.lte(dc, f.date_lte);
    if (f.ilike_name)         query = query.ilike("name", `%${f.ilike_name}%`);
    if (f.ilike_company_name) query = query.ilike("company_name", `%${f.ilike_company_name}%`);
    if (f.ilike_party_name)   query = query.ilike("party_name", `%${f.ilike_party_name}%`);
    if (f.in_sub_group)       query = query.in("sub_group", [].concat(f.in_sub_group));
    if (f.in_category)        query = query.in("category", [].concat(f.in_category));
    if (f.gt_total_price !== undefined) query = query.gt("total_price", f.gt_total_price);
    if (f.gte_overdue_days !== undefined) query = query.gte("overdue_days", f.gte_overdue_days);
    if (f.lte_overdue_days !== undefined) query = query.lte("overdue_days", f.lte_overdue_days);

    if (q.order_by) query = query.order(q.order_by, { ascending: q.order_asc === true });
    query = query.limit(q.limit || 5000);

    const { data, error } = await query;
    // Clean null/undefined
    const cleaned = (data || []).map(row => {
      const c = {};
      for (const [k, v] of Object.entries(row)) {
        c[k] = (v === null || v === undefined || v === "EMPTY") ? "" : v;
      }
      return c;
    });

    results.push({
      purpose: q.purpose || q.table,
      table: q.table,
      data: cleaned,
      error: error?.message || null,
      count: cleaned.length
    });
  }
  return results;
}

// ── STEP 3: FORMAT ANSWER ─────────────────────────────────────────────────────
async function aiAnswer(userMessage, plan, queryResults, chatHistory) {
  // For pivot tables — build server-side (guaranteed correct)
  if (plan.response_format === "pivot_table") {
    const qr = queryResults[0];
    if (!qr || !qr.data.length) {
      return `No data found for the requested period.`;
    }
    const months = plan.pivot_months || [
      "2025-04","2025-05","2025-06","2025-07","2025-08","2025-09",
      "2025-10","2025-11","2025-12","2026-01","2026-02","2026-03"
    ];
    const rowField = plan.pivot_row_field || "category";
    const valField = plan.pivot_val_field || "total_price";
    return buildPivotHTML(qr.data, rowField, valField, months);
  }

  // For all others — AI formats
  const dataSummary = queryResults.map(r => {
    if (r.error) return `[${r.purpose}] ERROR: ${r.error}`;
    if (!r.data.length) return `[${r.purpose}] No records found`;
    return `[${r.purpose}] ${r.count} records:\n${JSON.stringify(r.data.slice(0, 400))}`;
  }).join("\n\n---\n\n");

  const noSalesNote = queryResults.find(r => r.purpose === "last_year_sales") ? `
LOST CLIENTS: Find company_names in last_year_sales NOT in this_year_sales.
Show: Rank | Company | Last Year Revenue. Sort by revenue desc.
` : "";

  const answerPrompt = `You are a Sales & Finance Assistant for Mis Work India Private Limited.
Reply in ENGLISH only. Understand Hindi/Hinglish/typos.
User intent: ${plan.intent}

HTML TABLE STYLE:
<table border='1' cellpadding='8' cellspacing='0' style='border-collapse:collapse;width:100%;font-size:12px;font-family:Arial'>
Header: background:#1a1a2e; color:white
Even rows: #f9f9f9, Odd: #fff
Grand Total row: background:#e0e0e0; font-weight:bold — ALWAYS ADD THIS ROW AT BOTTOM
Amount format: Rs. X,XX,XXX (Indian, no decimals)
Date format: DD-Mon-YY (e.g. 15-Apr-25) — NEVER show 2025-04-15

RULES:
- NEVER show "undefined", "null", "EMPTY" — use "-" instead
- ALWAYS add Grand Total row at the bottom of every table
- Use ONLY data provided below
- For client lists: show numbered list with company names
- Start directly with the answer

${noSalesNote}

DATA:
${dataSummary}`;

  const messages = [
    ...chatHistory.slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  return await openai(answerPrompt, messages, 4000);
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

    // Step 1: Plan
    let plan;
    try {
      plan = await aiPlan(message, history);
      console.log("[PLAN]", JSON.stringify(plan, null, 2));
    } catch(e) {
      console.error("[PLAN ERROR]", e.message);
      return res.json({ reply: "Could not understand your query. Please try rephrasing.", type: "text" });
    }

    // Clarification needed
    if (plan.needs_clarification) {
      const options = plan.clarification_options || [];
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: plan.clarification_question }
      ]);
      return res.json({ reply: plan.clarification_question, type: options.length ? "suggestions" : "text", options });
    }

    // Step 2: Ledger
    if (plan.response_format === "ledger") {
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

    // Step 3: Run queries
    let queryResults;
    try {
      queryResults = await runQueries(plan);
      console.log("[QUERIES]", queryResults.map(r => `${r.purpose}:${r.count}`).join(", "));
    } catch(e) {
      console.error("[QUERY ERROR]", e.message);
      return res.json({ reply: "Database error: " + e.message, type: "text" });
    }

    const totalRows = queryResults.reduce((s, r) => s + r.count, 0);
    if (totalRows === 0) {
      const options = ["Show all sales", "Show all expenses", "Show pending payments", "Show ledger"];
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: "No data found" }
      ]);
      return res.json({ reply: `No data found for: "${message}". What would you like to see?`, type: "suggestions", options });
    }

    // Step 4: Format
    let reply;
    try {
      reply = await aiAnswer(message, plan, queryResults, history);
    } catch(e) {
      console.error("[ANSWER ERROR]", e.message);
      return res.json({ reply: "Could not format answer: " + e.message, type: "text" });
    }

    if (session_id) await supabase.from("chat_history").insert([
      { session_id, role: "user", content: message },
      { session_id, role: "assistant", content: reply }
    ]);

    const replyType = /<table|<div|<tr|<td|<th/i.test(reply) ? "html" : "text";
    return res.json({ reply, type: replyType });

  } catch(err) {
    console.error("[CHAT ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MIS Chatbot running at http://localhost:${PORT}`));