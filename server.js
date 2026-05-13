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
async function openai(systemPrompt, userMessage, chatHistory = [], maxTokens = 2000) {
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
      messages: [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-4).map(h => ({ role: h.role, content: h.content })),
        { role: "user", content: userMessage }
      ]
    })
  });
  const d = await response.json();
  if (!response.ok) throw new Error(d.error?.message || JSON.stringify(d));
  return d.choices?.[0]?.message?.content || "";
}

// ── DATABASE SCHEMA (sent to AI so it understands the data) ──────────────────
const DB_SCHEMA = `
You have access to a Supabase database for "Mis Work India Private Limited" — an IT/software company in Delhi.
Today's date: ${new Date().toISOString().split("T")[0]}
Current financial year: April 2025 to March 2026

=== TABLE: sales ===
- created_at (timestamp)   → invoice date
- id (int)                 → serial number
- invoice_no (text)        → e.g. "MIS-24-25-123"
- company_name (text)      → client name [also called: party, customer, INVOICE TO]
- address, state, gst_no, contact_person, phone (text)
- description (text)       → work description
- total_price (numeric)    → invoice amount in Rs.
- category (text)          → product/service type
- invoice_pdf (text)       → Google Drive URL
- login (text)             → salesperson name

Category values in sales:
"GOOGLE SHEET - RETAINERSHIP", "GOOGLE SHEET - CUSTOM", "GOOGLE SHEET - READY", "GOOGLE SHEET - AMC",
"PHP - PANSARI", "PHP - OTHERS", "WHATSAPP CREDIT", "WA Wallet",
"ERP - CALL SYSTEM", "ERP - READY PRODUCTS",
"MOBILE APP - PANSARI", "MOBILE APP - OTHERS",
"WEB FORM", "TALLY"

=== TABLE: expenses ===
- date (date)              → expense date
- voucher_number (int)
- party_name (text)        → vendor/payee
- group (text)             → main group
- sub_group (text)         → expense category
- design_number (text)     → description/narration
- amount (numeric)         → Rs.
- type (text)              → "Dr" or "Cr"

Sub_group values in expenses:
"Salary", "OFFICE RENT", "Phone and Internet", "Technical Exp", "Travel Exp",
"Utility Direc", "INSURANCE", "Repair & Maintenance", "BRANDING EXP", "COMMISSION EXP",
"Stationery", "Legal & Prof Exp", "Employees Welfare", "Financial Exp",
"Computer Maintenance", "Bad Debts", "Factory Related", "OFFICE EXP",
"Telephone Exp", "Indirect Expenses"

=== TABLE: pending ===
- bill_date (date), bill_ref_no (text), party_name (text), party_group (text)
- sales_person (text)
- pending_amount (text)    → stored as "₹1,090"
- due_date (date), overdue_days (int)

=== TABLE: ledger ===
- name (text)              → company/party name
- subgroup, group (text)
- email, contact_person, mobile (text)
- opening_balance, closing_balance (numeric)
- voucher_date (date)
- voucher_particular, voucher_type, voucher_no (text)
- voucher_debit, voucher_credit (numeric)
`;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtAmt(n) {
  const num = parseFloat(String(n || "").replace(/[₹,]/g, "")) || 0;
  if (!num) return "0.00";
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d).split("T")[0];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return String(dt.getDate()).padStart(2,"0") + "-" + months[dt.getMonth()] + "-" + String(dt.getFullYear()).slice(2);
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

  const TD = `padding:5px 8px;border:1px solid #999;font-size:12px;font-family:Arial,sans-serif`;
  const TH = `padding:6px 8px;border:1px solid #555;font-size:12px;font-family:Arial,sans-serif;font-weight:bold;background:#222;color:#fff`;

  let rows = `<tr>
    <td style="${TD};white-space:nowrap"><b>01-Apr-25</b></td>
    <td style="${TD}"><b>To</b></td>
    <td style="${TD}" colspan="3"><b>Opening Balance</b></td>
    <td style="${TD};text-align:right"><b>${openBal > 0 ? fmtAmt(openBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${openBal < 0 ? fmtAmt(Math.abs(openBal)) : ""}</b></td>
  </tr>`;

  txns.forEach(r => {
    const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
    rows += `<tr>
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

  rows += `<tr style="background:#f2f2f2">
    <td style="${TD}" colspan="5"><b>Closing Balance</b></td>
    <td style="${TD};text-align:right"><b>${closeBal > 0 ? fmtAmt(closeBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${closeBal < 0 ? fmtAmt(Math.abs(closeBal)) : ""}</b></td>
  </tr>
  <tr style="background:#e0e0e0">
    <td style="${TD}" colspan="5"><b>Total</b></td>
    <td style="${TD};text-align:right"><b>${fmtAmt(grandDr)}</b></td>
    <td style="${TD};text-align:right"><b>${fmtAmt(grandCr)}</b></td>
  </tr>`;

  return `<div style="font-family:Arial,sans-serif;font-size:12px;max-width:900px">
    <div style="text-align:center;padding:10px 4px 4px;border-bottom:2px solid #333">
      <div style="font-size:14px;font-weight:bold">Mis Work India Private Limited</div>
      <div style="font-size:11px;margin-top:3px">7th Floor, Unit No-775, Plot No E4, Aggarwal Millenium Tower 2</div>
      <div style="font-size:11px">Netaji Subhash Place, New Delhi - 110034</div>
    </div>
    <div style="text-align:center;padding:8px 4px 4px;border-bottom:1px solid #999">
      <div style="font-size:13px;font-weight:bold">${info.name}</div>
      <div style="font-size:11px;margin-top:2px">Ledger Account — ${firstDate} to ${lastDate}</div>
    </div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr>
          <th style="${TH};text-align:left">Date</th>
          <th style="${TH};text-align:left">&nbsp;</th>
          <th style="${TH};text-align:left">Particulars</th>
          <th style="${TH};text-align:left">Vch Type</th>
          <th style="${TH};text-align:left">Vch No.</th>
          <th style="${TH};text-align:right">Debit</th>
          <th style="${TH};text-align:right">Credit</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding:4px 8px;font-size:11px;color:#555;display:flex;justify-content:space-between;border-top:1px solid #ccc">
      <span>Total Transactions: <b>${txns.length}</b></span>
      <span>Net Balance: <b>Rs. ${fmtAmt(Math.abs(closeBal))} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}</b></span>
    </div>
  </div>`;
}

// ── CHAT HISTORY ROUTES ───────────────────────────────────────────────────────
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

// ── STEP 1: AI decides what queries to run ────────────────────────────────────
async function aiPlan(userMessage, chatHistory) {
  const planPrompt = `${DB_SCHEMA}

Your task: Read the user's question and return a JSON query plan.
Return ONLY raw JSON — no explanation, no markdown, no code fences.

JSON structure:
{
  "intent": "brief description of what user wants",
  "response_format": "ledger | pivot_table | table | text",
  "ledger_search": "company name (only if response_format is ledger)",
  "pivot_months": ["2025-04","2025-05",...],
  "pivot_row_field": "category",
  "pivot_val_field": "total_price",
  "queries": [
    {
      "table": "sales | expenses | pending | ledger",
      "select": "col1,col2 or *",
      "filters": { ...see below... },
      "order_by": "column_name",
      "order_asc": true,
      "limit": 5000,
      "purpose": "label for this query e.g. this_year_sales"
    }
  ]
}

Allowed filter keys inside filters{}:
  date_gte              → date range start (YYYY-MM-DD)
  date_lte              → date range end (YYYY-MM-DD)
  ilike_name            → partial match on 'name' column (ledger)
  ilike_company_name    → partial match on 'company_name' (sales)
  ilike_party_name      → partial match on 'party_name' (expenses/pending)
  in_sub_group          → array e.g. ["Salary","OFFICE RENT"]
  in_category           → array e.g. ["GOOGLE SHEET - RETAINERSHIP"]
  gt_total_price        → e.g. 0 (exclude zero invoices)
  gte_overdue_days      → e.g. 90
  lte_overdue_days      → e.g. 120

Language/Typo mappings you MUST handle:
  lgdr / ldgr / khata   → ledger query, response_format: "ledger"
  pansri / pansary      → "pansari"
  retainer/retainrship  → "GOOGLE SHEET - RETAINERSHIP"
  salari / tankhwa      → "Salary"
  kiraya                → "OFFICE RENT"
  pvt ltd / private limited → strip from company search term
  dikhao/batao/show/de  → show/display (intent word, not company name)

Special query patterns:
- "salary + rent + travel total" → in_sub_group: ["Salary","OFFICE RENT","Travel Exp"]
- "top 5 clients" → sales table, gt_total_price:0, limit:5000 (AI will rank in step 3)
- "clients with no invoice this year but had last year":
    query1: sales table, date_gte:"2025-04-01", date_lte:"2026-03-31", purpose:"this_year_sales"
    query2: sales table, date_gte:"2024-04-01", date_lte:"2025-03-31", purpose:"last_year_sales"
- "category x month pivot" → sales table full year, response_format:"pivot_table"
- "60-90 days pending" → pending table, gte_overdue_days:60, lte_overdue_days:90
- "120+ days pending" → pending table, gte_overdue_days:120
`;

  const text = await openai(planPrompt, userMessage, chatHistory, 1000);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI did not return valid JSON plan");
  return JSON.parse(match[0]);
}

// ── STEP 2: Execute Supabase queries ─────────────────────────────────────────
async function runQueries(plan) {
  const results = [];
  const dateColMap = { sales: "created_at", expenses: "date", pending: "due_date", ledger: "voucher_date" };

  for (const q of plan.queries) {
    let query = supabase.from(q.table).select(q.select || "*");
    const f = q.filters || {};
    const dc = dateColMap[q.table] || "created_at";

    if (f.date_gte)          query = query.gte(dc, f.date_gte);
    if (f.date_lte)          query = query.lte(dc, f.date_lte);
    if (f.ilike_name)        query = query.ilike("name", `%${f.ilike_name}%`);
    if (f.ilike_company_name) query = query.ilike("company_name", `%${f.ilike_company_name}%`);
    if (f.ilike_party_name)  query = query.ilike("party_name", `%${f.ilike_party_name}%`);
    if (f.in_sub_group)      query = query.in("sub_group", [].concat(f.in_sub_group));
    if (f.in_category)       query = query.in("category", [].concat(f.in_category));
    if (f.gt_total_price !== undefined) query = query.gt("total_price", f.gt_total_price);
    if (f.gte_overdue_days !== undefined) query = query.gte("overdue_days", f.gte_overdue_days);
    if (f.lte_overdue_days !== undefined) query = query.lte("overdue_days", f.lte_overdue_days);

    if (q.order_by) query = query.order(q.order_by, { ascending: q.order_asc !== false });
    query = query.limit(q.limit || 5000);

    const { data, error } = await query;
    results.push({
      purpose: q.purpose || q.table,
      table: q.table,
      data: data || [],
      error: error?.message || null,
      count: (data || []).length
    });
  }
  return results;
}

// ── STEP 3: AI formats the final answer ──────────────────────────────────────
async function aiAnswer(userMessage, plan, queryResults, chatHistory) {
  const dataSummary = queryResults.map(r => {
    if (r.error)        return `[${r.purpose}] ERROR: ${r.error}`;
    if (!r.data.length) return `[${r.purpose}] No records found`;
    return `[${r.purpose}] ${r.count} records:\n${JSON.stringify(r.data.slice(0, 300))}`;
  }).join("\n\n---\n\n");

  const pivotNote = plan.response_format === "pivot_table" ? `
PIVOT TABLE REQUIRED:
- Rows = ${plan.pivot_row_field || "category"} (sort by row total, highest first)
- Columns = months: ${(plan.pivot_months || []).join(", ")}
- Values = sum of ${plan.pivot_val_field || "total_price"} per category per month
- Calculate totals from the raw JSON data provided
- Show "-" for zero/empty cells
- Add Total column (row sum) and Grand Total row (column sums)
- Table header: background #1a1a2e, color white
- Total column: background #fff3cd
- Grand total row: background #e0e0e0
` : "";

  const noSalesNote = queryResults.find(r => r.purpose === "last_year_sales") ? `
LOST CLIENTS ANALYSIS:
- "this_year_sales" = clients invoiced Apr 2025 - Mar 2026
- "last_year_sales" = clients invoiced Apr 2024 - Mar 2025
- Find company_names in last_year_sales that are NOT in this_year_sales
- Show: Rank, Company Name, Last Year Total Revenue
- Sort by revenue (highest first)
- Also show total potential revenue being missed
` : "";

  const answerPrompt = `You are a Sales & Finance Assistant for Mis Work India Private Limited.
Always reply in ENGLISH. You understand Hindi, Hinglish, typos perfectly.

User intent: ${plan.intent}

HTML TABLE STYLE for all data output:
<table border='1' cellpadding='6' style='border-collapse:collapse;width:100%;font-size:12px;font-family:Arial'>

${pivotNote}
${noSalesNote}

RULES:
- Use ONLY the database data provided. NEVER invent or assume any number.
- Always show totals and grand totals.
- Format all amounts as Rs. X,XX,XXX (Indian format, no decimals for display).
- If invoice_pdf URL exists, show as: <a href="URL" target="_blank">View PDF</a>
- Start your response directly with the answer (no preamble like "Here is your data").
- If combining multiple expense categories, show each category as a separate row then grand total.

DATABASE DATA:
${dataSummary}`;

  return await openai(answerPrompt, userMessage, chatHistory, 4000);
}

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    // ── User clicked a suggestion → show ledger directly ──
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

    // ── STEP 1: AI plans what to fetch ──
    let plan;
    try {
      plan = await aiPlan(message, history);
      console.log("[PLAN]", JSON.stringify(plan, null, 2));
    } catch(e) {
      console.error("[PLAN ERROR]", e.message);
      return res.json({ reply: "I could not understand your query. Please rephrase it.", type: "text" });
    }

    // ── STEP 2: Ledger → special direct handling ──
    if (plan.response_format === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) return res.json({ reply: "Please tell me the company name for the ledger.", type: "text" });

      const { data } = await supabase.from("ledger")
        .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
        .ilike("name", `%${search}%`).order("voucher_date", { ascending: true }).limit(2000);

      if (!data || !data.length) {
        return res.json({ reply: `No ledger found matching "${search}". Please check the company name.`, type: "text" });
      }

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

    // ── STEP 3: Run DB queries ──
    let queryResults;
    try {
      queryResults = await runQueries(plan);
      console.log("[QUERIES]", queryResults.map(r => `${r.purpose}: ${r.count} rows`).join(", "));
    } catch(e) {
      console.error("[QUERY ERROR]", e.message);
      return res.json({ reply: "Database error: " + e.message, type: "text" });
    }

    const totalRows = queryResults.reduce((s, r) => s + r.count, 0);
    if (totalRows === 0) {
      const reply = `No data found for: "${message}". Please check spelling or try different keywords.`;
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: reply }
      ]);
      return res.json({ reply, type: "text" });
    }

    // ── STEP 4: AI formats answer ──
    let reply;
    try {
      reply = await aiAnswer(message, plan, queryResults, history);
    } catch(e) {
      console.error("[ANSWER ERROR]", e.message);
      return res.json({ reply: "Could not format the answer: " + e.message, type: "text" });
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
app.listen(PORT, () => console.log(`MIS Chatbot (GPT-4o Brain) running at http://localhost:${PORT}`));