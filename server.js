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
You are a smart Sales & Finance Assistant for "Mis Work India Private Limited" — an IT/software company in Delhi.
Today's date: ${new Date().toISOString().split("T")[0]}
Current financial year: April 2025 to March 2026

SYNONYM MAPPINGS (treat all these as the same):
- client = customer = party = company = client name = party name = customer name
- show = dikhao = batao = de = dedo = dikha = share = give = bta
- ledger = lgdr = ldgr = khata = account statement = balanc
- invoice = bill = invois = receipt
- salary = salari = tankhwa = wages
- rent = kiraya = office rent
- expense = kharcha = kharch = cost = expenditure
- pending = baaki = baki = overdue = due
- month wise = monthly = mahina wise = mahine ka
- team member = employee = staff = party_name in expenses

DATABASE TABLES:

=== TABLE: sales ===
- created_at (timestamp)     → invoice date [USE for date filtering]
- invoice_no (text)          → e.g. "MIS-24-25-123"
- company_name (text)        → CLIENT name [also called: party, customer, client, INVOICE TO]
- address, state, gst_no (text)
- contact_person (text)      → person name at client company
- phone (text)
- description (text)         → work description
- total_price (numeric)      → invoice amount in Rs. [NEVER filter this unless asked]
- category (text)            → product/service type
- invoice_pdf (text)         → Google Drive PDF URL
- login (text)               → our salesperson name

Category values (EXACT spelling):
"GOOGLE SHEET - RETAINERSHIP","GOOGLE SHEET - CUSTOM","GOOGLE SHEET - READY","GOOGLE SHEET - AMC",
"PHP - PANSARI","PHP - OTHERS","WHATSAPP CREDIT","WA Wallet",
"ERP - CALL SYSTEM","ERP - READY PRODUCTS",
"MOBILE APP - PANSARI","MOBILE APP - OTHERS","WEB FORM","TALLY"

=== TABLE: expenses ===
- date (date)                → expense date [USE for date filtering]
- voucher_number (int)
- party_name (text)          → vendor OR team member name (for salary, this is the employee name)
- group (text)               → main group e.g. "OFFICE EXP","Indirect Expenses"
- sub_group (text)           → expense category
- design_number (text)       → description/narration of expense
- amount (numeric)           → Rs.
- type (text)                → "Dr" or "Cr"

Sub_group values (EXACT spelling):
"Salary","OFFICE RENT","Phone and Internet","Technical Exp","Travel Exp","Utility Direc",
"INSURANCE","Repair & Maintenance","BRANDING EXP","COMMISSION EXP","Stationery",
"Legal & Prof Exp","Employees Welfare","Financial Exp","Computer Maintenance",
"Bad Debts","Factory Related","OFFICE EXP","Telephone Exp","Indirect Expenses","Other Expense"

=== TABLE: pending ===
- bill_date (date), bill_ref_no (text)
- party_name (text)          → client name
- party_group (text), sub_group (text)
- sales_person (text)
- pending_amount (text)      → stored as "₹1,090" format
- due_date (date)
- overdue_days (int)         → number of days overdue

=== TABLE: ledger ===
- name (text)                → company/party name [USE ilike for search]
- subgroup, group (text)
- email, contact_person, mobile (text)
- opening_balance, closing_balance (numeric)
- voucher_date (date)
- voucher_particular, voucher_type, voucher_no (text)
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

// Format YYYY-MM to "Apr-25" style
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

  const TD = `padding:6px 10px;border:1px solid #ddd;font-size:12px;font-family:Arial`;
  const TH = `padding:7px 10px;border:1px solid #555;font-size:12px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff`;

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
    <td style="${TD}" colspan="5"><b>Total</b></td>
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
          <th style="${TH}">Date</th>
          <th style="${TH}">&nbsp;</th>
          <th style="${TH}">Particulars</th>
          <th style="${TH}">Vch Type</th>
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

// ── STEP 1: AI PLANS WHAT TO FETCH ───────────────────────────────────────────
async function aiPlan(userMessage, chatHistory) {
  const planPrompt = `${getSchema()}

YOUR TASK: Read the user's question (considering the full conversation history for context) and return a JSON plan describing what database queries to run.

CRITICAL RULES FOR PLANNING:
1. ALWAYS use conversation history to understand follow-up questions. If user says "unka phone number do" after asking about a company, they mean that company's phone number.
2. If the query is too vague or ambiguous to answer, set "needs_clarification": true and provide "clarification_question" with 2-3 options.
3. NEVER return empty queries for valid questions. "list of all clients" → query sales table for company_name.
4. For salary/team member queries → query expenses table with sub_group = "Salary", party_name has employee names.
5. For "list of clients" → query sales table, select distinct company_name.
6. gt_total_price: 0 is ONLY needed when user wants to exclude zero-amount records. For listing clients, DO NOT add this filter.

WHEN TO ASK CLARIFICATION (set needs_clarification: true):
- Query is completely unrelated to sales/finance/expenses/ledger/pending
- Query has multiple possible meanings that would give very different answers
- Example: "show me data" → ask "What data? Sales, expenses, pending, or ledger?"

Return ONLY raw JSON (no markdown, no explanation):
{
  "intent": "clear description of what user wants",
  "needs_clarification": false,
  "clarification_question": "",
  "clarification_options": [],
  "response_format": "ledger | pivot_table | table | list | text",
  "ledger_search": "company name if ledger query",
  "pivot_months": ["2025-04","2025-05",...],
  "pivot_row_field": "category or party_name",
  "pivot_val_field": "total_price or amount",
  "queries": [
    {
      "table": "sales | expenses | pending | ledger",
      "select": "specific columns or *",
      "filters": {},
      "order_by": "column",
      "order_asc": false,
      "limit": 5000,
      "purpose": "descriptive label"
    }
  ]
}

FILTER KEYS (use exactly these in filters{}):
  date_gte              → start date YYYY-MM-DD
  date_lte              → end date YYYY-MM-DD
  ilike_name            → partial company search in ledger.name
  ilike_company_name    → partial search in sales.company_name
  ilike_party_name      → partial search in expenses/pending.party_name
  in_sub_group          → array of sub_group values e.g. ["Salary","OFFICE RENT"]
  in_category           → array of category values
  gt_total_price        → exclude records below this amount (use ONLY when explicitly needed)
  gte_overdue_days      → minimum overdue days
  lte_overdue_days      → maximum overdue days

EXAMPLES:
- "list all clients" → sales table, select:"company_name", no filters, purpose:"all_clients"
- "top 5 clients by revenue" → sales table, select:"company_name,total_price", purpose:"top_clients"  
- "salary expenses" → expenses, in_sub_group:["Salary"], purpose:"salary_data"
- "team member wise salary pivot" → expenses, in_sub_group:["Salary"], response_format:"pivot_table", pivot_row_field:"party_name"
- "pansri ka ledger" → response_format:"ledger", ledger_search:"pansari"
- "60-90 days pending" → pending, gte_overdue_days:60, lte_overdue_days:90
- "salary + rent + travel total" → expenses, in_sub_group:["Salary","OFFICE RENT","Travel Exp"]
- "total sales vs expenses month wise" → 2 queries: sales+expenses both with date range
- "give me list of client name added last year" → sales, date_gte:"2024-04-01", date_lte:"2025-03-31", select:"company_name,created_at"
`;

  const messages = [
    ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const text = await openai(planPrompt, messages, 1200);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in plan response");
  return JSON.parse(match[0]);
}

// ── STEP 2: EXECUTE SUPABASE QUERIES ─────────────────────────────────────────
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
    results.push({
      purpose: q.purpose || q.table,
      table: q.table,
      data: (data || []).map(row => {
        // Clean undefined/null values for display
        const cleaned = {};
        for (const [k, v] of Object.entries(row)) {
          cleaned[k] = (v === null || v === undefined || v === "EMPTY") ? "" : v;
        }
        return cleaned;
      }),
      error: error?.message || null,
      count: (data || []).length
    });
  }
  return results;
}

// ── STEP 3: AI FORMATS THE ANSWER ────────────────────────────────────────────
async function aiAnswer(userMessage, plan, queryResults, chatHistory) {
  const dataSummary = queryResults.map(r => {
    if (r.error) return `[${r.purpose}] ERROR: ${r.error}`;
    if (!r.data.length) return `[${r.purpose}] No records found (0 results)`;
    return `[${r.purpose}] ${r.count} total records:\n${JSON.stringify(r.data.slice(0, 400))}`;
  }).join("\n\n---\n\n");

  // Build month labels for pivot
  const monthLabels = (plan.pivot_months || []).map(m => `"${m}":"${fmtMonth(m)}"`).join(",");

  const pivotNote = plan.response_format === "pivot_table" ? `
PIVOT TABLE INSTRUCTIONS:
- Build a pivot: rows = ${plan.pivot_row_field || "category"}, columns = months
- Month display format mapping: {${monthLabels}}
- Show month names like "Apr-25", "May-25" NOT "2025-04"
- Values = sum of ${plan.pivot_val_field || "total_price"} per row per month
- Calculate directly from raw JSON records provided
- Skip rows where ALL values are zero or empty
- Show "-" for zero/empty cells (not "0" or "undefined")
- Last column = Total (sum of row), last row = Grand Total
- Sort rows by Total descending (highest first)
- Table header: background:#1a1a2e; color:white
- Alternating row colors: white and #f9f9f9
- Total column background: #fff3cd
- Grand Total row background: #e0e0e0; font-weight:bold
` : "";

  const noSalesNote = queryResults.find(r => r.purpose === "last_year_sales") ? `
LOST CLIENTS ANALYSIS:
- From "this_year_sales" extract all unique company_names
- From "last_year_sales" extract all unique company_names with their total revenue
- Find companies in last_year_sales NOT in this_year_sales
- Show: Rank | Company Name | Last Year Revenue | Category
- Sort by last year revenue (highest first)
- Show count of lost clients and total potential revenue at bottom
` : "";

  const answerPrompt = `You are a Sales & Finance Assistant for Mis Work India Private Limited.
Always reply in ENGLISH. You understand Hindi, Hinglish, and typos perfectly.

User's intent: ${plan.intent}

HTML TABLE STYLING RULES (apply to ALL tables):
- Table: <table border='1' cellpadding='8' cellspacing='0' style='border-collapse:collapse;width:100%;font-size:12px;font-family:Arial;margin-top:8px'>
- Header: <th style='background:#1a1a2e;color:#fff;padding:8px 10px;text-align:left;font-size:12px'>
- Even rows: background:#fff; Odd rows: background:#f9f9f9
- Amount cells: text-align:right
- Total/summary rows: background:#e8e8e8; font-weight:bold
- NO undefined, NO null, NO "EMPTY" in output — skip or show "-" instead
- Date columns: show as "15-Apr-25" format (DD-Mon-YY), NOT "2025-04-15"
- Month columns in pivot: show as "Apr-25" format, NOT "2025-04"
- Amount format: Rs. X,XX,XXX (Indian format, no decimals)

${pivotNote}
${noSalesNote}

GENERAL RULES:
- Use ONLY the database data below. NEVER invent numbers.
- Always show totals and record counts.
- If PDF URL present: <a href="URL" target="_blank" style="color:#1a73e8">View PDF</a>
- Start response directly with the answer (no intro text like "Here is your data").
- For "list of clients" — show a numbered list or table of unique company names.
- For combined expense queries — show each category as a row, grand total at bottom.
- If data has company_name, show it. If party_name, show it. Never show the column name as value.

DATABASE DATA:
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
    // ── User clicked suggestion → show ledger ──
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

    // ── STEP 1: AI Plan ──
    let plan;
    try {
      plan = await aiPlan(message, history);
      console.log("[PLAN]", JSON.stringify(plan, null, 2));
    } catch(e) {
      console.error("[PLAN ERROR]", e.message);
      return res.json({ reply: "I could not understand your query. Could you please rephrase it?", type: "text" });
    }

    // ── AI needs clarification ──
    if (plan.needs_clarification) {
      const clarifyMsg = plan.clarification_question || "Could you please clarify what you need?";
      const options = plan.clarification_options || [];
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: clarifyMsg }
      ]);
      return res.json({
        reply: clarifyMsg,
        type: options.length ? "suggestions" : "text",
        options
      });
    }

    // ── STEP 2: Ledger special handling ──
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
          { session_id, role: "assistant", content: "Multiple companies found. Please select one." }
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
      console.log("[QUERIES]", queryResults.map(r => `${r.purpose}:${r.count}`).join(", "));
    } catch(e) {
      console.error("[QUERY ERROR]", e.message);
      return res.json({ reply: "Database error: " + e.message, type: "text" });
    }

    const totalRows = queryResults.reduce((s, r) => s + r.count, 0);

    // If no data found — ask clarification instead of dead end
    if (totalRows === 0) {
      const clarifyMsg = `I searched the database but found no results for: "${message}".\n\nCould you clarify what you are looking for?`;
      const options = ["Show all sales data", "Show all expenses", "Show pending payments", "Show ledger"];
      if (session_id) await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: clarifyMsg }
      ]);
      return res.json({ reply: clarifyMsg, type: "suggestions", options });
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
app.listen(PORT, () => console.log(`MIS Chatbot running at http://localhost:${PORT}`));