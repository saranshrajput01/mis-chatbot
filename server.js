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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
              AND table_name IN ('sales','expenses','pending','ledger','products','delegation_tasks','checklist_tasks','scores')
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

// ── FIX #6: WhatsApp session store for pending selections ──────────────────
const wpPendingSessions = {}; // phone -> { type: 'ledger'|'product'|'data', options: [], originalQuery: '' }

// ── FIX #1 & #5 & #10: IMPROVED AI SYSTEM PROMPT ─────────────────────────
function buildSystemPrompt(isWhatsApp = false) {
  return `You are an expert Sales & Finance Assistant for "Mis Work India Private Limited".
Today: ${new Date().toISOString().split("T")[0]}. Financial year: Apr 2025 – Mar 2026.

${liveSchema}

=== ADDITIONAL SCHEMA NOTES ===
TABLE: public.sales
  category values: 'GOOGLE SHEET - RETAINERSHIP','GOOGLE SHEET - CUSTOM','GOOGLE SHEET - READY',
  'GOOGLE SHEET - AMC','PHP - PANSARI','PHP - OTHERS','WHATSAPP CREDIT','WA Wallet',
  'ERP - CALL SYSTEM','ERP - READY PRODUCTS','MOBILE APP - PANSARI','MOBILE APP - OTHERS','WEB FORM','TALLY'

TABLE: public.expenses
  *** CRITICAL: Employee name is stored in the "design_number" column for salary entries ***
  *** To find salary of a specific employee: WHERE sub_group ILIKE '%salary%' AND design_number ILIKE '%name%' ***
  sub_group values: 'Salary','OFFICE RENT','Phone and Internet','Technical Exp','Travel Exp',
  'Utility Direc','INSURANCE','Repair & Maintenance','BRANDING EXP','COMMISSION EXP',
  'Stationery','Legal & Prof Exp','Employees Welfare','Financial Exp','Computer Maintenance',
  'Bad Debts','OFFICE EXP','Telephone Exp','Indirect Expenses','Other Expense'

TABLE: public.products
  columns: id, item_name, image_link, description
  Use for: product search, catalog, toys, bags, items

TABLE: public.checklist_tasks
  columns: id, task_name, assigned_to, status, priority, remarks, department

TABLE: public.scores
  columns: id, employee_name, score_value, category, period, remarks
  score_value is TEXT — never use AVG() or SUM() on it

TABLE: public.delegation_tasks
  columns: id, del_task_id, plan_date, final_date, delegate_from, delegated_to,
           project_name, task_name, del_remarks, priority, department_id, del_url
  priority values: 'High', 'Medium', 'Low'
  Use ILIKE for name searches on delegated_to and delegate_from

=== CRITICAL QUERY TYPE RULES ===
${isWhatsApp ? `
WHATSAPP MODE — VERY IMPORTANT:
- If user message contains words like "chart", "graph", "visual", "trend", "bar chart", "pie chart" → query_type: "chart"
- Otherwise for ALL data queries → query_type: "data"  
- NEVER return query_type:"chart" unless user explicitly asked for a chart/graph
` : `
WEB MODE:
- If user asks for chart/graph/visual/trend/bar/pie/line/doughnut → query_type: "chart"
- Otherwise → query_type: "data"
`}

=== SALARY QUERY RULES — VERY IMPORTANT ===
- "top salary wale" = employees with highest TOTAL salary — GROUP BY design_number
- "top 5 salary wale bande" = SELECT design_number as employee_name, SUM(amount) as total_salary FROM expenses WHERE sub_group ILIKE '%salary%' AND design_number != '' AND design_number NOT ILIKE '%remuneration%' GROUP BY design_number ORDER BY total_salary DESC LIMIT 5
- "top 5 month salary" = months with highest salary expense — GROUP BY month
- "employee X ki salary" = that specific employee's salary month wise
- NEVER group all salary into same amount — always show individual employee names

=== PRODUCT QUERY RULES ===
- "prod list" / "product list" / "all products" = SELECT id, item_name, image_link, description FROM products ORDER BY item_name — NO LIMIT or LIMIT 200
- "bear bag image" / "X ki image" = SELECT item_name, image_link, description FROM products WHERE item_name ILIKE '%X%' OR description ILIKE '%X%' ORDER BY item_name — NO LIMIT
- Always search both item_name AND description for product queries
- For image requests: return ALL matching products, not just first 5

=== FUZZY NAME MATCHING ===
- If a ledger/product/employee name is slightly misspelled, still find closest matches using ILIKE with partial words
- Break the search term into words and search each word: e.g. "pansri industr" → search '%pansari%' OR '%pansri%' OR '%industr%' OR '%industries%'

=== CHART CONFIG FORMAT ===
chart_config: {
  "type": "bar" | "line" | "pie" | "doughnut",
  "title": "Descriptive title",
  "sql": "SELECT label_col, value_col FROM ... GROUP BY ... ORDER BY ...",
  "label_col": "exact column name for labels",
  "value_col": "exact column name for values"
}

=== LANGUAGE ===
Understand Hindi/Hinglish perfectly:
- salary/salari/tankhwah = sub_group ILIKE '%salary%'
- rent/kiraya = sub_group ILIKE '%rent%'
- ledger/khata/bahi = query_type:"ledger"
- bande/log/employee = person/employee
- top X wale = ORDER BY ... DESC LIMIT X
- is saal/this year = Apr 2025 - Mar 2026
- image/tasveer = image_link from products
- list/suchi = all records

=== SQL RULES ===
CRITICAL:
- NEVER filter on columns that might be NULL/empty without fallback
- Always return data even if some columns are empty (use COALESCE)  
- For text searches: always use ILIKE not =
- Only SELECT statements, no INSERT/UPDATE/DELETE
- LIMIT 200 for product queries (show all products)
- LIMIT 100 for other queries unless aggregating
- ROUND(SUM(amount)::numeric, 0) for amounts
- UPPER(company_name) for grouping to merge duplicates
- All date columns are TIMESTAMP — use TO_CHAR() for grouping
- For month grouping: TO_CHAR(date_col, 'YYYY-MM') as month
- design_number column stores employee names for salary

=== NOT BUSINESS RELATED ===
Only casual greetings (hello, hi, how are you, thanks) → {"query_type": "not_relevant"}
Everything else including product, task, score queries → try to answer

=== RESPONSE FORMAT (strict JSON only, no markdown, no explanation) ===
{
  "query_type": "ledger | data | chart | clarify | not_relevant",
  "ledger_search": "company name if ledger query",
  "sql": "SELECT ... (for data queries)",
  "chart_config": { ... },
  "clarify_message": "question if truly unclear",
  "clarify_options": []
}`;
}

async function processQuery(userMessage, chatHistory, isWhatsApp = false) {
  if (!liveSchema) await fetchLiveSchema();

  const messages = [
    ...chatHistory.slice(-10).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const planText = await openai(buildSystemPrompt(isWhatsApp), messages, 1500);
  const match = planText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON from AI");
  return JSON.parse(match[0]);
}

// ── FIX #6: Fuzzy ledger search ───────────────────────────────────────────
async function fuzzyLedgerSearch(searchTerm) {
  // Try exact ilike first
  const { data: exact } = await supabase.from("ledger")
    .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
    .ilike("name", `%${searchTerm}%`)
    .order("voucher_date", { ascending: true })
    .limit(2000);

  if (exact && exact.length) return exact;

  // Fuzzy fallback: try each word separately
  const words = searchTerm.split(/\s+/).filter(w => w.length > 2);
  if (!words.length) return [];

  // Build OR conditions
  for (const word of words) {
    const { data: fuzzy } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${word}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (fuzzy && fuzzy.length) return fuzzy;
  }
  return [];
}

// ── FIX #2: IMPROVED PDF Generation (proper page layout) ──────────────────
function buildLedgerHTML(info, txns) {
  const openBal  = parseFloat(info.opening_balance) || 0;
  const closeBal = parseFloat(info.closing_balance) || 0;
  const dates    = txns.map(r => r.voucher_date).filter(Boolean).sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
  const lastDate  = dates[dates.length - 1] ? fmtDate(dates[dates.length - 1]) : firstDate;
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

  const totalDr = txns.reduce((s, r) => s + (parseFloat(r.voucher_debit) || 0), 0);
  const totalCr = txns.reduce((s, r) => s + (parseFloat(r.voucher_credit) || 0), 0);
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
      <div style="font-size:13px;font-weight:bold">Ledger: ${info.name}</div>
      <div style="font-size:11px;color:#555;margin-top:2px">${firstDate} to ${lastDate}</div>
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

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    if (exactName) {
      const data = await fuzzyLedgerSearch(exactName);
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
      plan = await processQuery(message, history, false);
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
      const data = await fuzzyLedgerSearch(search);
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

// ── FIX #2: IMPROVED PDF — Proper A4 landscape with correct page breaks ───
async function generateLedgerPDF(info, txns) {
  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `ledger_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 25, size: "A4", layout: "landscape" });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);

      const openBal  = parseFloat(info.opening_balance) || 0;
      const closeBal = parseFloat(info.closing_balance) || 0;
      const dates    = txns.map(r => r.voucher_date).filter(Boolean).sort();
      const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
      const lastDate  = dates[dates.length-1] ? fmtDate(dates[dates.length-1]) : firstDate;

      // Column positions and widths for A4 landscape (842 x 595)
      const pageW = doc.page.width;
      const margin = 25;
      const tableW = pageW - margin * 2;

      // Column widths (total = tableW)
      const colWidths = {
        date:       75,
        type:       22,
        particular: 230,
        vchType:    85,
        vchNo:      90,
        debit:      100,
        credit:     100
      };

      // Column X positions
      const colX = {};
      let xPos = margin;
      Object.entries(colWidths).forEach(([key, w]) => {
        colX[key] = xPos;
        xPos += w;
      });

      const ROW_H = 14;
      const HEADER_H = 16;

      function drawPageHeader() {
        // Company header background
        doc.rect(0, 0, pageW, 55).fill("#1a1a2e");
        doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
           .text("Mis Work India Private Limited", margin, 10, { align: "center", width: tableW });
        doc.fontSize(7.5).font("Helvetica")
           .text("7th Floor, Unit No-775, Aggarwal Millenium Tower 2, Netaji Subhash Place, New Delhi - 110034",
                 margin, 27, { align: "center", width: tableW });
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff")
           .text(`Ledger: ${info.name}   |   ${firstDate} to ${lastDate}`,
                 margin, 40, { align: "center", width: tableW });
      }

      function drawColumnHeaders(y) {
        doc.rect(margin, y, tableW, HEADER_H).fill("#333355");
        doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
        doc.text("Date",         colX.date,       y + 4, { width: colWidths.date });
        doc.text("",             colX.type,       y + 4, { width: colWidths.type });
        doc.text("Particulars",  colX.particular, y + 4, { width: colWidths.particular });
        doc.text("Vch Type",     colX.vchType,    y + 4, { width: colWidths.vchType });
        doc.text("Vch No.",      colX.vchNo,      y + 4, { width: colWidths.vchNo });
        doc.text("Debit (Rs.)",  colX.debit,      y + 4, { width: colWidths.debit,  align: "right" });
        doc.text("Credit (Rs.)", colX.credit,     y + 4, { width: colWidths.credit, align: "right" });
        return y + HEADER_H;
      }

      // Draw first page header
      drawPageHeader();
      let y = 58;
      y = drawColumnHeaders(y);

      // Opening balance row
      doc.rect(margin, y, tableW, ROW_H).fill("#f0f4ff");
      doc.fillColor("#000000").fontSize(7).font("Helvetica-Bold");
      doc.text("01-Apr-25",       colX.date,       y + 3, { width: colWidths.date });
      doc.text("To",              colX.type,       y + 3, { width: colWidths.type });
      doc.text("Opening Balance", colX.particular, y + 3, { width: colWidths.particular });
      doc.text("",                colX.vchType,    y + 3, { width: colWidths.vchType });
      doc.text("",                colX.vchNo,      y + 3, { width: colWidths.vchNo });
      doc.text(openBal > 0 ? fmtAmt(openBal) : "",
               colX.debit, y + 3, { width: colWidths.debit, align: "right" });
      doc.text(openBal < 0 ? fmtAmt(Math.abs(openBal)) : "",
               colX.credit, y + 3, { width: colWidths.credit, align: "right" });
      y += ROW_H;

      // Draw border line between rows
      function drawRowBorder(rowY) {
        doc.moveTo(margin, rowY).lineTo(margin + tableW, rowY)
           .strokeColor("#e0e0e0").lineWidth(0.3).stroke();
      }

      // Transaction rows
      doc.fontSize(7).font("Helvetica");
      txns.forEach((r, i) => {
        // Page break check — leave room for closing/grand total rows (3 rows * ROW_H = 42)
        if (y > doc.page.height - 55) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 25 });
          drawPageHeader();
          y = 58;
          y = drawColumnHeaders(y);
        }

        const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
        const bgColor = i % 2 === 0 ? "#ffffff" : "#f9f9f9";
        doc.rect(margin, y, tableW, ROW_H).fill(bgColor);
        drawRowBorder(y);

        doc.fillColor("#000000");
        doc.text(fmtDate(r.voucher_date),   colX.date,       y + 3, { width: colWidths.date });
        doc.text(isDr ? "To" : "By",        colX.type,       y + 3, { width: colWidths.type });

        // Truncate particulars if too long
        const particular = (r.voucher_particular || "").substring(0, 45);
        doc.text(particular,                colX.particular, y + 3, { width: colWidths.particular });
        doc.text((r.voucher_type || "").substring(0, 18), colX.vchType, y + 3, { width: colWidths.vchType });
        doc.text((r.voucher_no || "").substring(0, 18),   colX.vchNo,   y + 3, { width: colWidths.vchNo });
        doc.text(isDr ? fmtAmt(r.voucher_debit) : "",
                 colX.debit,  y + 3, { width: colWidths.debit,  align: "right" });
        doc.text(!isDr ? fmtAmt(r.voucher_credit) : "",
                 colX.credit, y + 3, { width: colWidths.credit, align: "right" });
        y += ROW_H;
      });

      // Ensure closing balance fits on current page
      if (y > doc.page.height - 45) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 25 });
        drawPageHeader();
        y = 58;
        y = drawColumnHeaders(y);
      }

      // Closing balance row
      doc.rect(margin, y, tableW, ROW_H).fill("#e8eaf6");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Closing Balance", colX.date, y + 3, { width: colWidths.date + colWidths.type + colWidths.particular + colWidths.vchType + colWidths.vchNo });
      doc.text(closeBal > 0 ? fmtAmt(closeBal) : "",          colX.debit,  y + 3, { width: colWidths.debit,  align: "right" });
      doc.text(closeBal < 0 ? fmtAmt(Math.abs(closeBal)) : "", colX.credit, y + 3, { width: colWidths.credit, align: "right" });
      y += ROW_H;

      // Grand total row
      const totalDr = txns.reduce((s, r) => s + (parseFloat(r.voucher_debit) || 0), 0);
      const totalCr = txns.reduce((s, r) => s + (parseFloat(r.voucher_credit) || 0), 0);
      const grandDr = totalDr + (openBal > 0 ? openBal : 0);
      const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

      doc.rect(margin, y, tableW, ROW_H).fill("#c8c8c8");
      doc.text("Grand Total", colX.date, y + 3, { width: colWidths.date + colWidths.type + colWidths.particular + colWidths.vchType + colWidths.vchNo });
      doc.text(fmtAmt(grandDr), colX.debit,  y + 3, { width: colWidths.debit,  align: "right" });
      doc.text(fmtAmt(grandCr), colX.credit, y + 3, { width: colWidths.credit, align: "right" });
      y += ROW_H + 6;

      // Footer
      doc.fontSize(7).font("Helvetica").fillColor("#666666")
         .text(`Total Transactions: ${txns.length}   |   Net Balance: ${fmtAmt(Math.abs(closeBal))} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}`,
               margin, y);

      doc.end();
      stream.on("finish", () => { resolve(tmpPath); });
      stream.on("error", reject);
    } catch(e) { reject(e); }
  });
}

// ── FIX #4: IMPROVED Chart with value labels ──────────────────────────────
function buildChartURL(chartConfig, rows) {
  const labels = rows.map(r => String(r[chartConfig.label_col] || ""));
  const values = rows.map(r => parseFloat(r[chartConfig.value_col] || 0));

  const COLORS = ["#4361ee","#3a0ca3","#7209b7","#f72585","#4cc9f0","#06d6a0","#ffd166","#ef476f","#118ab2","#073b4c","#e76f51","#2a9d8f"];

  // Format value labels for chart (show in Lakhs/K for readability)
  function fmtChartLabel(v) {
    if (v >= 100000) return "Rs." + (v/100000).toFixed(1) + "L";
    if (v >= 1000)   return "Rs." + (v/1000).toFixed(0) + "K";
    return "Rs." + v;
  }

  const chartDef = {
    type: chartConfig.type || "bar",
    data: {
      labels,
      datasets: [{
        label: chartConfig.title || "Data",
        data: values,
        backgroundColor: (chartConfig.type === "pie" || chartConfig.type === "doughnut")
          ? COLORS.slice(0, values.length)
          : values.map((_, i) => COLORS[i % COLORS.length]),
        borderColor: chartConfig.type === "line" ? "#4361ee" : "rgba(255,255,255,0.8)",
        borderWidth: chartConfig.type === "line" ? 2 : 1,
        fill: chartConfig.type === "line" ? false : undefined,
        tension: chartConfig.type === "line" ? 0.4 : undefined
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: chartConfig.title || "Chart",
          font: { size: 16, weight: "bold" },
          padding: { bottom: 16 }
        },
        legend: {
          display: chartConfig.type === "pie" || chartConfig.type === "doughnut",
          position: "right"
        },
        // FIX #4: Add data labels on bars/slices
        datalabels: {
          display: true,
          anchor: chartConfig.type === "bar" ? "end" : "center",
          align: chartConfig.type === "bar" ? "top" : "center",
          color: chartConfig.type === "bar" ? "#333" : "#fff",
          font: { size: 10, weight: "bold" },
          formatter: (value) => fmtChartLabel(value)
        }
      },
      scales: (chartConfig.type !== "pie" && chartConfig.type !== "doughnut") ? {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => {
              if (v >= 100000) return "Rs." + (v/100000).toFixed(1) + "L";
              if (v >= 1000)   return "Rs." + (v/1000).toFixed(0) + "K";
              return "Rs." + v;
            },
            font: { size: 10 }
          },
          grid: { color: "rgba(0,0,0,0.08)" }
        },
        x: {
          ticks: { font: { size: 10 }, maxRotation: 45 },
          grid: { display: false }
        }
      } : {}
    }
  };

  const encoded = encodeURIComponent(JSON.stringify(chartDef));
  // Use chartjs-plugin-datalabels via QuickChart
  return `https://quickchart.io/chart?w=900&h=500&bkg=white&c=${encoded}`;
}

async function downloadChartImage(chartURL) {
  const resp = await fetch(chartURL);
  if (!resp.ok) throw new Error("QuickChart failed: " + resp.status);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `chart_${Date.now()}.png`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

// ── FIX #3: Upload to Supabase and send media directly (no link msg) ──────
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

// FIX #3: Send media WITHOUT sending extra link message
async function sendWhatsAppMedia(to, filePath, caption, mediaType = "document") {
  const WA_API_KEY = "24c23ac43d6ac2835e2cd16b6a1f2916715921fd173bba82ab";
  const WA_API_URL = "http://app.mis.work/api/v1/message/create";
  const phone = String(to).split("@")[0].replace(/[^0-9]/g, "").replace(/^91/, "");
  try {
    const publicUrl = await uploadToSupabase(filePath, mediaType);
    // Send the file directly — NO separate link message
    const resp = await fetch(WA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": WA_API_KEY },
      body: JSON.stringify({
        receiverMobileNo: phone,
        filePathUrl: [publicUrl],
        caption: caption ? [caption] : undefined
      })
    });
    console.log("[WA MEDIA SENT]", resp.status);
    try { fs.unlinkSync(filePath); } catch(e) {}
  } catch (e) {
    console.error("[WA MEDIA ERROR]", e.message);
    try { fs.unlinkSync(filePath); } catch(ex) {}
    await sendWhatsAppReply(phone, caption + "\n\n⚠️ File bhejne mein error aaya.");
  }
}

async function sendWhatsAppReply(to, message) {
  try {
    const WA_API_KEY = "24c23ac43d6ac2835e2cd16b6a1f2916715921fd173bba82ab";
    const WA_API_URL = "http://app.mis.work/api/v1/message/create";
    const phone = String(to).split("@")[0].replace(/[^0-9]/g, "").replace(/^91/, "");
    message = String(message).slice(0, 1500);
    await fetch(WA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": WA_API_KEY },
      body: JSON.stringify({ receiverMobileNo: phone, message: [message] })
    });
  } catch(e) {
    console.error("[WHATSAPP REPLY ERROR]", e.message);
  }
}

// ── FIX #6: WhatsApp numbered option selector ─────────────────────────────
function isNumberSelection(msg) {
  return /^[1-9]$/.test(msg.trim()) || /^[1-9]\.$/.test(msg.trim());
}

function getNumberFromMsg(msg) {
  return parseInt(msg.trim().replace(".", "")) - 1; // 0-indexed
}

// ── WHATSAPP WEBHOOK ──────────────────────────────────────────────────────
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

    // ── FIX #6: Handle numbered selection from pending session ─────────
    if (isNumberSelection(actualQuery) && wpPendingSessions[actualPhone]) {
      const session = wpPendingSessions[actualPhone];
      const idx = getNumberFromMsg(actualQuery);
      const selectedOption = session.options[idx];

      if (!selectedOption) {
        await sendWhatsAppReply(actualPhone, `❌ Invalid selection. Please enter a number between 1 and ${session.options.length}.`);
        return res.json({ success: true });
      }

      // Clear the session
      delete wpPendingSessions[actualPhone];

      if (session.type === "ledger") {
        // Process ledger for selected company
        const data = await fuzzyLedgerSearch(selectedOption);
        if (!data || !data.length) {
          await sendWhatsAppReply(actualPhone, `❌ Ledger not found for "${selectedOption}"`);
          return res.json({ success: true });
        }
        const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
        const bal = parseFloat(data[0].closing_balance) || 0;
        const summaryText = `📒 *Ledger: ${selectedOption}*\n\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "(Dr)" : "(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`;
        await sendWhatsAppReply(actualPhone, summaryText);
        res.json({ success: true });
        try {
          const pdfPath = await generateLedgerPDF(data[0], txns);
          const pdfCaption = `📄 *${selectedOption} — Ledger Statement*\nBalance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "(Dr)" : "(Cr)"}`;
          await sendWhatsAppMedia(actualPhone, pdfPath, pdfCaption, "document");
        } catch(e) {
          console.error("[LEDGER PDF FAILED]", e.message);
          await sendWhatsAppReply(actualPhone, "⚠️ PDF generate karne mein error aaya.");
        }
        return;
      }
      return res.json({ success: true });
    }

    let plan;
    try { plan = await processQuery(actualQuery, [], true); }
    catch(e) { return res.json({ success: false, error: e.message }); }

    if (plan.query_type === "not_relevant") {
      console.log("[WHATSAPP IGNORED]", actualQuery);
      return res.json({ success: true, ignored: true });
    }

    // ── LEDGER ────────────────────────────────────────────────────────────
    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) {
        await sendWhatsAppReply(actualPhone, "Please tell me the company name.");
        return res.json({ success: true });
      }

      // FIX #6: Use fuzzy search
      const data = await fuzzyLedgerSearch(search);
      if (!data || !data.length) {
        // Try to find similar names for suggestions
        const { data: allNames } = await supabase.from("ledger")
          .select("name").limit(500);
        const uniqueAll = [...new Set((allNames || []).map(r => r.name))];

        // Find similar names using word matching
        const words = search.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const similar = uniqueAll.filter(name =>
          words.some(w => name.toLowerCase().includes(w))
        ).slice(0, 5);

        if (similar.length) {
          // Store pending session
          wpPendingSessions[actualPhone] = { type: "ledger", options: similar, originalQuery: search };
          const suggestionText = `❓ "${search}" nahi mila. Kya aap yeh chahte hain?\n\n` +
            similar.map((n, i) => `${i+1}. ${n}`).join("\n") +
            "\n\nReply with number (1, 2, 3...)";
          await sendWhatsAppReply(actualPhone, suggestionText);
        } else {
          await sendWhatsAppReply(actualPhone, `❌ No ledger found for "${search}"`);
        }
        return res.json({ success: true });
      }

      const uniqueNames = [...new Set(data.map(r => r.name))];
      if (uniqueNames.length > 1) {
        // FIX #6: Store pending session and send numbered list
        wpPendingSessions[actualPhone] = { type: "ledger", options: uniqueNames.slice(0, 8), originalQuery: search };
        const replyText = `🏢 Multiple companies found:\n\n` +
          uniqueNames.slice(0, 8).map((n, i) => `${i+1}. ${n}`).join("\n") +
          "\n\nReply with number (1, 2, 3...)";
        await sendWhatsAppReply(actualPhone, replyText);
        return res.json({ success: true });
      }

      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const bal = parseFloat(data[0].closing_balance) || 0;
      const companyName = data[0].name;
      const summaryText = `📒 *Ledger: ${companyName}*\n\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal >= 0 ? "(Dr)" : "(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`;
      await sendWhatsAppReply(actualPhone, summaryText);
      res.json({ success: true, reply: summaryText });

      // FIX #3: Send PDF directly, no extra link message
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

    // ── FIX #10: CHART — only if user asked for chart/graph ──────────────
    if (plan.query_type === "chart" && plan.chart_config) {
      const cfg = plan.chart_config;
      let rows;
      try { rows = await runSQL(cfg.sql); } catch(e) {
        await sendWhatsAppReply(actualPhone, "❌ Chart data error: " + e.message);
        return res.json({ success: false });
      }
      if (!rows || !rows.length) {
        await sendWhatsAppReply(actualPhone, "❌ Chart ke liye koi data nahi mila.");
        return res.json({ success: true });
      }

      // FIX #10: Only send image since user asked for chart
      res.json({ success: true });
      try {
        const chartURL = buildChartURL(cfg, rows);
        const imgPath = await downloadChartImage(chartURL);
        // FIX #3: send image directly, no link
        await sendWhatsAppMedia(actualPhone, imgPath, `📊 *${cfg.title || "Chart"}*`, "image");
      } catch(e) {
        console.error("[CHART FAILED]", e.message);
        await sendWhatsAppReply(actualPhone, "⚠️ Chart image nahi ban paya.");
      }
      return;
    }

    // ── FIX #7 & #8 & #9: Products — ALL products, ALL images ────────────
    if (plan.sql && plan.sql.toLowerCase().includes("from products")) {
      let rows;
      try { rows = await runSQL(plan.sql); }
      catch(e) { await sendWhatsAppReply(actualPhone, "❌ Error: " + e.message); return res.json({ success: true }); }

      if (!rows || !rows.length) {
        await sendWhatsAppReply(actualPhone, "❌ Koi product nahi mila.");
        return res.json({ success: true });
      }

      // Check if user asked for images
      const wantsImages = /image|tasveer|photo|pic|bhej|send/i.test(actualQuery);

      if (wantsImages) {
        // FIX #8: Send ALL related products with their images
        const productsWithImages = rows.filter(p => p.image_link && p.image_link.startsWith("http"));
        const productsWithoutImages = rows.filter(p => !p.image_link || !p.image_link.startsWith("http"));

        // Send summary first
        const summaryText = `🛍️ *${rows.length} Products Found*\n\n` +
          rows.map((p, i) => `${i+1}. ${p.item_name}`).join("\n");
        await sendWhatsAppReply(actualPhone, summaryText);
        res.json({ success: true });

        // Send images for ALL products that have them
        for (const p of productsWithImages) {
          try {
            await fetch("http://app.mis.work/api/v1/message/create", {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": "24c23ac43d6ac2835e2cd16b6a1f2916715921fd173bba82ab" },
              body: JSON.stringify({
                receiverMobileNo: actualPhone.replace(/^91/, ""),
                filePathUrl: [p.image_link],
                caption: [`🧸 *${p.item_name}*\n${(p.description || "").substring(0, 100)}`]
              })
            });
            await new Promise(r => setTimeout(r, 600)); // slight delay between images
          } catch(e) { console.error("[PRODUCT IMG ERROR]", e.message); }
        }

        // FIX #9: If some products have no image, say so
        if (productsWithoutImages.length) {
          const noImgNames = productsWithoutImages.map(p => `• ${p.item_name}`).join("\n");
          await sendWhatsAppReply(actualPhone, `ℹ️ *Image not available for:*\n${noImgNames}`);
        }
        return;
      }

      // FIX #7: Product LIST — send ALL product names (no images)
      // Split into chunks if too many products
      const chunkSize = 20;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const chunkText = (i === 0 ? `🛍️ *Products Found: ${rows.length}*\n\n` : `📦 *Continued...*\n\n`) +
          chunk.map((p, idx) => `${i + idx + 1}. *${p.item_name}*${p.description ? "\n   " + p.description.substring(0, 60) : ""}`).join("\n\n");
        await sendWhatsAppReply(actualPhone, chunkText);
        if (i + chunkSize < rows.length) await new Promise(r => setTimeout(r, 500));
      }
      return res.json({ success: true });
    }

    // ── FIX #10: Regular data query — send TEXT only (no auto chart) ─────
    if (!plan.sql) return res.json({ success: false, error: "Could not generate query" });
    let rows;
    try { rows = await runSQL(plan.sql); }
    catch(e) { return res.json({ success: false, error: "DB error: " + e.message }); }

    if (!rows || !rows.length) {
      await sendWhatsAppReply(actualPhone, `❌ No data found for: "${actualQuery}"`);
      return res.json({ success: true });
    }

    // ── FIX #5: Better text formatting for salary/data queries ───────────
    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];
    const cols = Object.keys(rows[0]);

    const replyLines = rows.slice(0, 10).map((r, i) => {
      // Smart name detection — check multiple possible name columns
      const nameColPriority = ["employee_name","design_number","company_name","name","party_name","item_name","invoice_no","sub_group"];
      let name = null;
      for (const col of nameColPriority) {
        if (r[col] && r[col] !== "" && r[col] !== "-" && r[col] !== "null") {
          name = r[col];
          break;
        }
      }
      if (!name) name = String(Object.values(r)[0] || "Item");

      // Smart amount detection
      const amountColPriority = ["total_salary","total_sales","total","amount","pending_amount","total_price","salary","score_value"];
      let amount = null;
      let amountLabel = "";
      for (const col of amountColPriority) {
        if (r[col] != null && r[col] !== "" && r[col] !== "-") {
          amount = r[col];
          amountLabel = col.replace(/_/g, " ");
          break;
        }
      }

      // Extra details — show remaining useful columns
      const usedCols = new Set([...nameColPriority, ...amountColPriority, "id"]);
      const extras = cols
        .filter(c => !usedCols.has(c) && r[c] !== null && r[c] !== "" && r[c] !== "NA" && r[c] !== "-")
        .slice(0, 3)
        .map(c => `${c.replace(/_/g," ")}: ${r[c]}`);

      let line = `${emojis[i] || `${i+1}.`} *${name}*`;
      if (amount != null && amount !== "") {
        const numAmt = parseFloat(String(amount).replace(/[₹,Rs.\s]/g, ""));
        if (!isNaN(numAmt) && numAmt > 0) {
          line += `\n   💰 Rs. ${numAmt.toLocaleString("en-IN")}`;
        } else {
          line += `\n   📊 ${amountLabel}: ${amount}`;
        }
      }
      if (extras.length) line += `\n   📌 ${extras.join(" | ")}`;
      return line;
    });

    let replyText = `📊 *Results: ${rows.length} records*\n\n${replyLines.join("\n\n")}`;
    if (rows.length > 10) replyText += `\n\n_...and ${rows.length - 10} more records_`;

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`MIS Chatbot running at http://localhost:${PORT}`);
  await fetchLiveSchema();
});

// ============================================================
// STEP 2 ADDITIONS — Google Sheet Sync + Document Intelligence
// ============================================================

const SHEET_ID = "1iNVOUtLk7sRGx-JkttGRd8jkWaIzAwkMoyBzA70OmDc";

async function fetchSheetCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const text = await res.text();
  return text;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim());
  return lines.slice(1).map(line => {
    const cols = [];
    let cur = "", inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
      else { cur += c; }
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] || ""; });
    return obj;
  });
}

async function syncProducts() {
  try {
    const csv = await fetchSheetCSV("1581260341");
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from("products").delete().neq("id", 0);
    const toInsert = rows
      .filter(r => r["ITEM NAME"] || r["item name"] || r["Item Name"])
      .map(r => ({
        item_name: r["ITEM NAME"] || r["Item Name"] || r["item name"] || r["itemName"] ||
          Object.values(r).find((v,i) => Object.keys(r)[i]?.toLowerCase().includes("item")) || "",
        image_link: r["image link"] || r["Image Link"] || r["IMAGE LINK"] || r["imageLink"] ||
          Object.values(r).find((v,i) => Object.keys(r)[i]?.toLowerCase().includes("image") && String(v).startsWith("http")) || "",
        description: r["Description"] || r["description"] || r["DESCRIPTION"] || ""
      }));
    if (toInsert.length) await supabase.from("products").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "products", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Products:", toInsert.length, "rows");
    return toInsert.length;
  } catch(e) {
    console.error("[SYNC ERROR] Products:", e.message);
    await supabase.from("sync_log").insert({ sheet_name: "products", rows_synced: 0, status: "error: " + e.message });
    return 0;
  }
}

async function syncDelegationTasks() {
  try {
    const csv = await fetchSheetCSV("1671023111");
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from("delegation_tasks").delete().neq("id", 0);
    const toInsert = rows
      .filter(r => r["taskName"] || r["task_name"])
      .map(r => ({
        del_task_id: r["delTaskId"] || r["del_task_id"] || "",
        plan_date: r["planDate"] ? convertExcelDate(r["planDate"]) : null,
        final_date: r["finalDate"] ? convertExcelDate(r["finalDate"]) : null,
        delegate_from: r["delegateFrom"] || r["delegate_from"] || "",
        delegated_to: r["delegatedTo"] || r["delegated_to"] || "",
        project_name: r["projectNm"] || r["project_name"] || "",
        task_name: r["taskName"] || r["task_name"] || "",
        del_remarks: r["delRemarks"] || r["del_remarks"] || "",
        priority: r["priority"] || "",
        department_id: r["departmentId"] || r["department_id"] || "",
        del_url: r["delUrl"] || r["del_url"] || ""
      }));
    if (toInsert.length) await supabase.from("delegation_tasks").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "delegation_tasks", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Delegation Tasks:", toInsert.length, "rows");
    return toInsert.length;
  } catch(e) {
    console.error("[SYNC ERROR] Delegation Tasks:", e.message);
    await supabase.from("sync_log").insert({ sheet_name: "delegation_tasks", rows_synced: 0, status: "error: " + e.message });
    return 0;
  }
}

function convertExcelDate(val) {
  if (!val) return null;
  if (String(val).includes("-") || String(val).includes("/")) return String(val).split("T")[0];
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  const date = new Date((num - 25569) * 86400 * 1000);
  return date.toISOString().split("T")[0];
}

async function syncChecklistTasks() {
  try {
    const csv = await fetchSheetCSV("426961603");
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from("checklist_tasks").delete().neq("id", 0);
    const toInsert = rows.filter(r => Object.values(r).some(v => v)).map(r => ({
      task_name: r["taskName"] || r["task_name"] || r["Task Name"] || "",
      assigned_to: r["taskTo"] || r["assigned_to"] || r["assignedTo"] || "",
      status: r["taskType"] || r["status"] || "",
      priority: r["priority"] || r["Priority"] || "",
      remarks: r["taskFrom"] || r["remarks"] || "",
      department: r["departmentId"] || r["department"] || "",
    }));
    if (toInsert.length) await supabase.from("checklist_tasks").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "checklist_tasks", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Checklist:", toInsert.length, "rows");
    return toInsert.length;
  } catch(e) {
    await supabase.from("sync_log").insert({ sheet_name: "checklist_tasks", rows_synced: 0, status: "error: " + e.message });
    return 0;
  }
}

async function syncScores() {
  try {
    const csv = await fetchSheetCSV("1226212674");
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from("scores").delete().neq("id", 0);
    const toInsert = rows.filter(r => Object.values(r).some(v => v)).map(r => ({
      employee_name: r["employee_name"] || r["employeeName"] || r["Employee Name"] || r["name"] || r["Name"] || "",
      score_value: r["score_value"] || r["scoreValue"] || r["Score"] || r["score"] || "",
      category: r["category"] || r["Category"] || "",
      period: r["period"] || r["Period"] || "",
      remarks: r["remarks"] || r["Remarks"] || ""
    }));
    if (toInsert.length) await supabase.from("scores").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "scores", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Scores:", toInsert.length, "rows");
    return toInsert.length;
  } catch(e) {
    await supabase.from("sync_log").insert({ sheet_name: "scores", rows_synced: 0, status: "error: " + e.message });
    return 0;
  }
}

async function syncAllSheets() {
  console.log("[SYNC] Starting full sync...");
  const results = {};
  results.products = await syncProducts();
  results.delegation_tasks = await syncDelegationTasks();
  results.checklist_tasks = await syncChecklistTasks();
  results.scores = await syncScores();
  console.log("[SYNC] Complete:", results);
  return results;
}

app.post("/sync", async (req, res) => {
  try {
    const results = await syncAllSheets();
    res.json({ ok: true, synced: results, timestamp: new Date().toISOString() });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/sync/status", async (req, res) => {
  try {
    const { data } = await supabase.from("sync_log")
      .select("*").order("synced_at", { ascending: false }).limit(20);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

setInterval(async () => {
  console.log("[AUTO-SYNC] Running scheduled sync...");
  await syncAllSheets();
}, 15 * 60 * 1000);

setTimeout(syncAllSheets, 5000);

// ── DOCUMENT INTELLIGENCE ─────────────────────────────────────────────────
app.post("/doc-intelligence", async (req, res) => {
  const { doc_url, doc_type, question, uploaded_by } = req.body;
  if (!doc_url) return res.status(400).json({ error: "doc_url required" });

  try {
    let extractedText = "";
    let docTitle = doc_url.substring(0, 80);

    if (doc_type === "google_sheet" || doc_url.includes("docs.google.com/spreadsheets")) {
      const match = doc_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const gidMatch = doc_url.match(/gid=(\d+)/);
      if (!match) throw new Error("Invalid Google Sheet URL");
      const sheetId = match[1];
      const gid = gidMatch ? gidMatch[1] : "0";
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      const csvRes = await fetch(csvUrl);
      if (!csvRes.ok) throw new Error("Could not fetch Google Sheet. Make sure it's publicly shared.");
      extractedText = await csvRes.text();
      extractedText = extractedText.substring(0, 8000);
      docTitle = "Google Sheet";
    } else if (doc_type === "pdf" || doc_url.includes(".pdf") || doc_url.includes("drive.google.com")) {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 2000,
          messages: [{ role: "user", content: `Please fetch and read this document URL and provide a detailed summary. URL: ${doc_url}\n\nUser question: ${question || "Please summarize this document."}` }]
        })
      });
      const aiData = await aiRes.json();
      const summary = aiData.choices?.[0]?.message?.content || "Could not read document.";
      await supabase.from("doc_intelligence").insert({ doc_type: "pdf", doc_url, doc_title: docTitle, ai_summary: summary, uploaded_by: uploaded_by || "web" });
      return res.json({ ok: true, summary, doc_type: "pdf" });
    } else {
      try {
        const urlRes = await fetch(doc_url, { headers: { "User-Agent": "Mozilla/5.0" } });
        extractedText = await urlRes.text();
        extractedText = extractedText.replace(/<[^>]*>/g, " ").substring(0, 6000);
      } catch(e) { extractedText = `URL: ${doc_url}`; }
    }

    const userQuestion = question || "Please provide a detailed summary of this document/data.";
    const SYSTEM_DOC = `You are a smart document analysis assistant for "Mis Work India Private Limited". Analyze the provided document content and answer questions accurately. If it's a spreadsheet/CSV, explain the data clearly. Keep answers concise but complete.`;
    const aiRes2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM_DOC },
          { role: "user", content: `Document Content:\n${extractedText}\n\n---\nQuestion: ${userQuestion}` }
        ]
      })
    });
    const aiData2 = await aiRes2.json();
    const summary = aiData2.choices?.[0]?.message?.content || "Could not analyze document.";
    await supabase.from("doc_intelligence").insert({ doc_type: doc_type || "url", doc_url, doc_title: docTitle, ai_summary: summary, raw_content: extractedText.substring(0, 2000), uploaded_by: uploaded_by || "web" });
    res.json({ ok: true, summary, doc_type: doc_type || "url", content_preview: extractedText.substring(0, 200) });
  } catch(err) {
    console.error("[DOC INTELLIGENCE ERROR]", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/doc-intelligence/history", async (req, res) => {
  try {
    const { data } = await supabase.from("doc_intelligence")
      .select("id,doc_type,doc_title,doc_url,ai_summary,created_at")
      .order("created_at", { ascending: false }).limit(20);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

app.post("/analyze-image", async (req, res) => {
  const { base64, mediaType } = req.body;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", max_tokens: 1000,
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } },
          { type: "text", text: "Describe this image in detail. If it contains text, extract it. If it's a product, describe it." }
        ]}]
      })
    });
    const data = await response.json();
    res.json({ summary: data.choices?.[0]?.message?.content || "Could not analyze" });
  } catch(e) { res.json({ summary: "Error: " + e.message }); }
});

process.on("unhandledRejection", (reason) => { console.error("[UNHANDLED REJECTION]", reason); });
process.on("uncaughtException", (err) => { console.error("[UNCAUGHT EXCEPTION]", err); });