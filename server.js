// Load .env only for local development (Railway has native env vars)
if (!process.env.RAILWAY_ENVIRONMENT) {
  require("dotenv").config();
}

// Debug: Check environment variables on startup
console.log("[ENV DEBUG] RAILWAY_ENVIRONMENT:", process.env.RAILWAY_ENVIRONMENT);
console.log("[ENV DEBUG] SUPABASE_URL:", process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing");
console.log("[ENV DEBUG] SUPABASE_SERVICE_KEY:", process.env.SUPABASE_SERVICE_KEY ? "✓ Set (first 20):" + process.env.SUPABASE_SERVICE_KEY.substring(0, 20) : "✗ Missing");
console.log("[ENV DEBUG] OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✓ Set (first 20):" + process.env.OPENAI_API_KEY.substring(0, 20) : "✗ Missing");
console.log("[ENV DEBUG] WA_API_KEY:", process.env.WA_API_KEY ? "✓ Set" : "✗ Missing");

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

// ── FIX #8: Session store for WP ──────────────────────────────────────────
// Stores: pending ledger selections, pending image sends, image send stop flag
const wpSessions = {};
// wpSessions[phone] = {
//   type: 'ledger_select' | 'image_confirm' | 'image_sending',
//   options: [],         // for ledger_select
//   products: [],        // for image_confirm / image_sending
//   sendingIndex: 0,     // for image_sending (current progress)
//   stopFlag: false      // for image_sending (user typed "stop")
// }

async function fetchLiveSchema() {
  try {
    console.log("[SCHEMA] Calling execute_sql RPC...");
    const { data, error } = await supabase.rpc("execute_sql", {
      query: `SELECT table_name, column_name, data_type
              FROM information_schema.columns
              WHERE table_schema = 'public'
              AND table_name IN ('sales','expenses','pending','ledger','products','delegation_tasks','checklist_tasks','scores')
              ORDER BY table_name, ordinal_position`
    });
    if (error || !data) { 
      console.error("[SCHEMA] RPC Error:", JSON.stringify(error, null, 2)); 
      return; 
    }
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
  // Debug: Check if API key is loaded
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("[OPENAI DEBUG] Key exists:", !!apiKey, "| First 20 chars:", apiKey?.substring(0, 20));
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
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

// ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
function buildSystemPrompt(isWhatsApp = false) {
  return `You are an expert Sales & Finance Assistant for "Mis Work India Private Limited".
Today: ${new Date().toISOString().split("T")[0]}. Financial year: Apr 2025 – Mar 2026.

${liveSchema}

=== SCHEMA NOTES ===
TABLE: public.sales
  columns: invoice_no, company_name, address, state, gst_no, contact_person, phone, description, total_price, category, invoice_pdf, created_at
  category values: 'GOOGLE SHEET - RETAINERSHIP','GOOGLE SHEET - CUSTOM','GOOGLE SHEET - READY','GOOGLE SHEET - AMC','PHP - PANSARI','PHP - OTHERS','WHATSAPP CREDIT','WA Wallet','ERP - CALL SYSTEM','ERP - READY PRODUCTS','MOBILE APP - PANSARI','MOBILE APP - OTHERS','WEB FORM','TALLY'

TABLE: public.expenses
  columns: date, voucher_no, party_name, grp, sub_group, design_number, amount, type
  *** CRITICAL: Employee name is in "design_number" column for salary entries ***
  *** salary query: WHERE sub_group ILIKE '%salary%' ***
  *** specific employee: WHERE sub_group ILIKE '%salary%' AND design_number ILIKE '%name%' ***
  sub_group values: 'Salary','OFFICE RENT','Phone and Internet','Technical Exp','Travel Exp','Utility Direc','INSURANCE','Repair & Maintenance','BRANDING EXP','COMMISSION EXP','Stationery','Legal & Prof Exp','Employees Welfare','Financial Exp','Computer Maintenance','Bad Debts','OFFICE EXP','Telephone Exp','Indirect Expenses','Other Expense'

TABLE: public.pending
  columns: bill_date, bill_ref_no, party_name, party_group, sub_group, sales_person, pending_amount, due_date, overdue_days
  *** CRITICAL: sales_person column stores the salesperson name ***
  *** "Shammi Ji", "Shammi ji", "Shammi" all refer to sales_person ILIKE '%shammi%' ***
  *** Always use ILIKE for sales_person searches ***

TABLE: public.ledger
  columns: name, subgroup, state, email, contact_person, mobile, opening_balance, voucher_date, voucher_particular, voucher_type, voucher_no, voucher_debit, voucher_credit, closing_balance

TABLE: public.products
  columns: id, item_name, image_link, description
  *** For image requests: return ALL matching products ***
  *** For list requests: LIMIT 200, no description needed ***

TABLE: public.delegation_tasks
  columns: id, del_task_id, plan_date, final_date, delegate_from, delegated_to,
           project_name, task_name, del_remarks, priority, department_id, del_url
  *** delegated_to = task kisko diya gaya hai ***
  *** delegate_from = kisne diya ***
  *** ALWAYS extract the person's first name from query and search with ILIKE ***
  *** ALWAYS search BOTH columns: ***
  *** WHERE delegated_to ILIKE '%firstname%' OR delegate_from ILIKE '%firstname%' ***
  *** NEVER use exact match, ALWAYS ILIKE ***
  *** Examples: ***
  ***   "Tanvi ke tasks" → ILIKE '%tanvi%' ***
  ***   "Monu kumar tasks" → ILIKE '%monu%' ***
  ***   "Saloni ki delegation" → ILIKE '%saloni%' ***
  *** If 0 results, also search checklist_tasks: ***
  ***   SELECT task_name, assigned_to, status, priority FROM checklist_tasks WHERE assigned_to ILIKE '%firstname%' ***

TABLE: public.checklist_tasks
  columns: id, task_name, assigned_to, status, priority, remarks, department

TABLE: public.scores
  columns: id, employee_name, score_value, category, period, remarks
  score_value is TEXT — never AVG() or SUM()

=== WHATSAPP MODE RULES ===
${isWhatsApp ? `
- query_type:"chart" ONLY if user explicitly says "chart", "graph", "visual", "trend chart", "bar chart"
- ALL other data queries → query_type:"data"
- For "kitne transactions", "count karo" etc → query_type:"data" with COUNT sql
- For product list/images → query_type:"data" with products table sql
` : `
- chart if user says chart/graph/visual/trend/bar/pie/line/doughnut
`}

=== SALARY RULES (CRITICAL) ===
- "top salary wale bande" = GROUP BY design_number, show individual employees
- SELECT design_number as employee_name, SUM(amount) as total_salary FROM expenses WHERE sub_group ILIKE '%salary%' AND design_number != '' AND design_number NOT ILIKE '%remuneration%' AND design_number NOT ILIKE '%office%' GROUP BY design_number ORDER BY total_salary DESC LIMIT 5
- "X ki salary" = WHERE sub_group ILIKE '%salary%' AND design_number ILIKE '%X%' GROUP BY TO_CHAR(date,'YYYY-MM') ORDER BY month
- "month mein salary" = GROUP BY month, SUM all salary entries that month

=== PENDING RULES (CRITICAL) ===
- "Shammi ji" / "Shami ji" / "Shammi" → sales_person ILIKE '%shammi%'
- Always search sales_person with ILIKE, never exact match
- "pending payments" → SELECT party_name, SUM(pending_amount) as total_pending, COUNT(*) as bills, MAX(overdue_days) as max_overdue FROM pending GROUP BY party_name ORDER BY total_pending DESC

=== DELEGATION TASK RULES ===
- Search BOTH delegated_to AND delegate_from with ILIKE
- Return: task_name, delegated_to, delegate_from, priority, plan_date, final_date, del_remarks
- If name not found in delegation_tasks, also check checklist_tasks assigned_to

=== PRODUCT RULES ===
- image request → SELECT item_name, image_link, description FROM products WHERE item_name ILIKE '%X%' OR description ILIKE '%X%' ORDER BY item_name (NO LIMIT for image requests)
- list request → SELECT id, item_name, image_link FROM products ORDER BY item_name LIMIT 200

=== PIVOT TABLE RULES (CRITICAL) ===
- "sales data party-wise with months" / "month-wise sales" / "12 months ka data" → MUST return pivot format:
  SELECT 
    company_name as party_name,
    TO_CHAR(created_at, 'YYYY-MM') as month,
    SUM(total_price) as total
  FROM sales
  WHERE created_at >= '2025-04-01'
  GROUP BY company_name, TO_CHAR(created_at, 'YYYY-MM')
  ORDER BY company_name, month
- CRITICAL: If user asks for "months" or "apr 2025, may 2025..." → MUST include "month" column
- ALWAYS include month column for time-series data
- For expenses month-wise: TO_CHAR(date, 'YYYY-MM') as month
- NEVER give just party_name + total without month breakdown when months are requested

=== SQL RULES ===
- NEVER filter NULL columns without fallback
- Only SELECT statements
- ILIKE for all text searches
- ROUND(SUM(amount)::numeric,0) for amounts
- TO_CHAR(date_col,'YYYY-MM') as month for grouping
- LIMIT 100 unless products (LIMIT 200) or aggregating

=== HINGLISH MAPPING ===
- salary/tankhwah = sub_group ILIKE '%salary%'
- rent/kiraya = sub_group ILIKE '%rent%'
- ledger/khata = query_type:"ledger"
- bande/log = people/employees
- top X wale = ORDER BY DESC LIMIT X
- kitne/count = COUNT(*)
- pending/baaki = pending table
- image/tasveer = image_link from products
- list/suchi = SELECT all

=== NOT RELEVANT ===
Only pure casual greetings (hi, hello, thanks) → query_type:"not_relevant"
ALL business queries including vague ones → try to answer

=== RESPONSE FORMAT (JSON only, no markdown) ===
{
  "query_type": "ledger | data | chart | clarify | not_relevant",
  "ledger_search": "company name",
  "sql": "SELECT ...",
  "chart_config": { "type":"bar|line|pie|doughnut", "title":"...", "sql":"...", "label_col":"...", "value_col":"..." },
  "clarify_message": "...",
  "clarify_options": []
  
}`;

// ── CSV GENERATION ────────────────────────────────────────────────────────
function generateCSV(rows, cols) {
  const tmpPath = path.join(os.tmpdir(), `data_${Date.now()}.csv`);
  const header = cols.join(",");
  const body = rows.map(r => cols.map(c => {
    const val = String(r[c] ?? "").replace(/"/g, '""');
    return val.includes(",") || val.includes("\n") ? `"${val}"` : val;
  }).join(",")).join("\n");
  fs.writeFileSync(tmpPath, header + "\n" + body, "utf8");
  return tmpPath;
}

async function generateDataPDF(rows, cols, title) {
  return new Promise((resolve, reject) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `data_${Date.now()}.pdf`);
      const doc = new PDFDocument({ margin: 15, size: "A4", layout: "landscape" });
      const stream = fs.createWriteStream(tmpPath);
      doc.pipe(stream);
      const pageW = doc.page.width;
      const margin = 15;
      const tableW = pageW - margin * 2;
      
      // Smart column limit: if >8 columns, use all (for pivot), else limit to 8
      const displayCols = cols.length > 8 ? cols : cols.slice(0, 8);
      const colW = Math.floor(tableW / displayCols.length);
      const fontSize = displayCols.length > 10 ? 5.5 : 6.5;

      function drawPageHeader() {
        doc.rect(0, 0, pageW, 35).fill("#1a1a2e");
        doc.fillColor("#fff").fontSize(10).font("Helvetica-Bold")
           .text(`Mis Work India — ${title}`, margin, 12, { align: "center", width: tableW });
      }
      function drawColHeaders(y) {
        doc.rect(margin, y, tableW, 14).fill("#333355");
        doc.fillColor("#fff").fontSize(fontSize).font("Helvetica-Bold");
        displayCols.forEach((col, i) => {
          doc.text(col.replace(/_/g," ").substring(0,15), margin + i * colW, y + 3, { width: colW - 2 });
        });
        return y + 14;
      }
      drawPageHeader();
      let y = 40;
      y = drawColHeaders(y);
      doc.fontSize(fontSize).font("Helvetica");
      rows.forEach((r, i) => {
        if (y > doc.page.height - 30) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 20 });
          drawPageHeader();
          y = 45;
          y = drawColHeaders(y);
          doc.fontSize(6.5).font("Helvetica");
        }
        doc.rect(margin, y, tableW, 13).fill(i % 2 === 0 ? "#fff" : "#f5f5f5");
        doc.fillColor("#000");
        displayCols.forEach((col, ci) => {
          const val = String(r[col] ?? "").substring(0, 22);
          doc.text(val, margin + ci * colW, y + 3, { width: colW - 2 });
        });
        y += 13;
      });
      doc.fontSize(7).fillColor("#666").text(`Total: ${rows.length} records`, margin, y + 5);
      doc.end();
      stream.on("finish", () => resolve(tmpPath));
      stream.on("error", reject);
    } catch(e) { reject(e); }
  });
}
}

async function processQuery(
  userMessage, chatHistory, isWhatsApp = false) {
  if (!liveSchema) await fetchLiveSchema();
  const messages = [
    ...chatHistory.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];
  const planText = await openai(buildSystemPrompt(isWhatsApp), messages, 1500);
  const match = planText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON from AI");
  return JSON.parse(match[0]);
}

async function executePlan({
  message,
  sessionId,
  platform,
  phone = null,
  chatHistory = []
}) {

  console.log("\n========== EXECUTE PLAN ==========");
  console.log("[PLATFORM]", platform);
  console.log("[MESSAGE]", message);

  // STEP 1: AI PLAN
  const plan = await processQuery(
    message,
    chatHistory,
    platform === "whatsapp"
  );

  console.log("[PLAN]", JSON.stringify(plan, null, 2));

  return plan;
}

// ── FUZZY LEDGER SEARCH ───────────────────────────────────────────────────
async function fuzzyLedgerSearch(searchTerm) {
  const { data: exact } = await supabase.from("ledger")
    .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
    .ilike("name", `%${searchTerm}%`)
    .order("voucher_date", { ascending: true })
    .limit(2000);
  if (exact && exact.length) return exact;

  const words = searchTerm.split(/\s+/).filter(w => w.length > 2);
  for (const word of words) {
    const { data: fuzzy } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${word}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (fuzzy && fuzzy.length) return fuzzy;
  }
  
  // Step 3: Partial prefix match (first 4 chars)
  const prefix = searchTerm.replace(/\s+/g,'').substring(0, 4);
  if (prefix.length >= 3) {
    const { data: prefix_data } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${prefix}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (prefix_data && prefix_data.length) return prefix_data;
  }
  // Step 4: First 3 chars fallback
  const prefix3 = searchTerm.replace(/\s+/g, '').substring(0, 3);
  if (prefix3.length >= 3) {
    const { data: p3 } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .ilike("name", `%${prefix3}%`)
      .order("voucher_date", { ascending: true })
      .limit(2000);
    if (p3 && p3.length) return p3;
  }
  return [];}
  
// ── LEDGER HTML ───────────────────────────────────────────────────────────
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

// ── PDF GENERATION ────────────────────────────────────────────────────────
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

      const pageW = doc.page.width;
      const margin = 25;
      const tableW = pageW - margin * 2;

      const colWidths = { date:75, type:22, particular:230, vchType:85, vchNo:90, debit:100, credit:100 };
      const colX = {};
      let xPos = margin;
      Object.entries(colWidths).forEach(([key, w]) => { colX[key] = xPos; xPos += w; });

      const ROW_H = 14;
      const HEADER_H = 16;

      function drawPageHeader() {
        doc.rect(0, 0, pageW, 55).fill("#1a1a2e");
        doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold")
           .text("Mis Work India Private Limited", margin, 10, { align: "center", width: tableW });
        doc.fontSize(7.5).font("Helvetica")
           .text("7th Floor, Unit No-775, Aggarwal Millenium Tower 2, Netaji Subhash Place, New Delhi - 110034", margin, 27, { align: "center", width: tableW });
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#ffffff")
           .text(`Ledger: ${info.name}   |   ${firstDate} to ${lastDate}`, margin, 40, { align: "center", width: tableW });
      }

      function drawColumnHeaders(y) {
        doc.rect(margin, y, tableW, HEADER_H).fill("#333355");
        doc.fillColor("#ffffff").fontSize(7.5).font("Helvetica-Bold");
        doc.text("Date",         colX.date,       y+4, { width: colWidths.date });
        doc.text("",             colX.type,       y+4, { width: colWidths.type });
        doc.text("Particulars",  colX.particular, y+4, { width: colWidths.particular });
        doc.text("Vch Type",     colX.vchType,    y+4, { width: colWidths.vchType });
        doc.text("Vch No.",      colX.vchNo,      y+4, { width: colWidths.vchNo });
        doc.text("Debit (Rs.)",  colX.debit,      y+4, { width: colWidths.debit,  align: "right" });
        doc.text("Credit (Rs.)", colX.credit,     y+4, { width: colWidths.credit, align: "right" });
        return y + HEADER_H;
      }

      drawPageHeader();
      let y = 58;
      y = drawColumnHeaders(y);

      // Opening balance
      doc.rect(margin, y, tableW, ROW_H).fill("#f0f4ff");
      doc.fillColor("#000000").fontSize(7).font("Helvetica-Bold");
      doc.text("01-Apr-25",       colX.date,       y+3, { width: colWidths.date });
      doc.text("To",              colX.type,       y+3, { width: colWidths.type });
      doc.text("Opening Balance", colX.particular, y+3, { width: colWidths.particular });
      doc.text("",                colX.vchType,    y+3, { width: colWidths.vchType });
      doc.text("",                colX.vchNo,      y+3, { width: colWidths.vchNo });
      doc.text(openBal > 0 ? fmtAmt(openBal) : "",          colX.debit,  y+3, { width: colWidths.debit,  align: "right" });
      doc.text(openBal < 0 ? fmtAmt(Math.abs(openBal)) : "", colX.credit, y+3, { width: colWidths.credit, align: "right" });
      y += ROW_H;

      doc.fontSize(7).font("Helvetica");
      txns.forEach((r, i) => {
        if (y > doc.page.height - 55) {
          doc.addPage({ size: "A4", layout: "landscape", margin: 25 });
          drawPageHeader();
          y = 58;
          y = drawColumnHeaders(y);
        }
        const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
        doc.rect(margin, y, tableW, ROW_H).fill(i % 2 === 0 ? "#ffffff" : "#f9f9f9");
        doc.fillColor("#000000");
        doc.text(fmtDate(r.voucher_date),   colX.date,       y+3, { width: colWidths.date });
        doc.text(isDr ? "To" : "By",        colX.type,       y+3, { width: colWidths.type });
        doc.text((r.voucher_particular||"").substring(0,45), colX.particular, y+3, { width: colWidths.particular });
        doc.text((r.voucher_type||"").substring(0,18),       colX.vchType,    y+3, { width: colWidths.vchType });
        doc.text((r.voucher_no||"").substring(0,18),         colX.vchNo,      y+3, { width: colWidths.vchNo });
        doc.text(isDr ? fmtAmt(r.voucher_debit) : "",        colX.debit,      y+3, { width: colWidths.debit,  align: "right" });
        doc.text(!isDr ? fmtAmt(r.voucher_credit) : "",      colX.credit,     y+3, { width: colWidths.credit, align: "right" });
        y += ROW_H;
      });

      if (y > doc.page.height - 45) {
        doc.addPage({ size: "A4", layout: "landscape", margin: 25 });
        drawPageHeader();
        y = 58;
        y = drawColumnHeaders(y);
      }

      // Closing balance
      doc.rect(margin, y, tableW, ROW_H).fill("#e8eaf6");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(7.5);
      doc.text("Closing Balance", colX.date, y+3, { width: colWidths.date+colWidths.type+colWidths.particular+colWidths.vchType+colWidths.vchNo });
      doc.text(closeBal > 0 ? fmtAmt(closeBal) : "",          colX.debit,  y+3, { width: colWidths.debit,  align: "right" });
      doc.text(closeBal < 0 ? fmtAmt(Math.abs(closeBal)) : "", colX.credit, y+3, { width: colWidths.credit, align: "right" });
      y += ROW_H;

      const totalDr = txns.reduce((s,r) => s+(parseFloat(r.voucher_debit)||0), 0);
      const totalCr = txns.reduce((s,r) => s+(parseFloat(r.voucher_credit)||0), 0);
      const grandDr = totalDr + (openBal > 0 ? openBal : 0);
      const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

      doc.rect(margin, y, tableW, ROW_H).fill("#c8c8c8");
      doc.text("Grand Total", colX.date, y+3, { width: colWidths.date+colWidths.type+colWidths.particular+colWidths.vchType+colWidths.vchNo });
      doc.text(fmtAmt(grandDr), colX.debit,  y+3, { width: colWidths.debit,  align: "right" });
      doc.text(fmtAmt(grandCr), colX.credit, y+3, { width: colWidths.credit, align: "right" });
      y += ROW_H + 6;

      doc.fontSize(7).font("Helvetica").fillColor("#666666")
         .text(`Total Transactions: ${txns.length}   |   Net Balance: ${fmtAmt(Math.abs(closeBal))} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}`, margin, y);

      doc.end();
      stream.on("finish", () => resolve(tmpPath));
      stream.on("error", reject);
    } catch(e) { reject(e); }
  });
}

// ── CHART ─────────────────────────────────────────────────────────────────
// FIX #2: Proper grouped bar chart with legends and value labels
function buildChartURL(chartConfig, rows) {
  const labels = rows.map(r => String(r[chartConfig.label_col] || ""));
  const values = rows.map(r => parseFloat(r[chartConfig.value_col] || 0));
  const chartType = chartConfig.type || "bar";
  const COLORS = ["#4361ee","#e63946","#2ec4b6","#ff9f1c","#7209b7","#06d6a0","#f72585","#118ab2"];

  function fmtLabel(v) {
    if (v >= 10000000) return (v/10000000).toFixed(1) + "Cr";
    if (v >= 100000)  return (v/100000).toFixed(1) + "L";
    if (v >= 1000)    return (v/1000).toFixed(0) + "K";
    return String(v);
  }

  const chartDef = {
    type: chartType,
    data: {
      labels,
      datasets: [{
        label: chartConfig.title || "Data",
        data: values,
        backgroundColor: (chartType === "pie" || chartType === "doughnut")
          ? COLORS.slice(0, values.length)
          : "#4361ee99",
        borderColor: "#4361ee",
        borderWidth: chartType === "line" ? 2 : 1,
        fill: false,
        tension: 0.4,
        pointRadius: 5,
        pointBackgroundColor: "#4361ee"
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: chartConfig.title || "Chart",
          font: { size: 16, weight: "bold" },
          padding: { bottom: 10 }
        },
        legend: { display: true, position: "top" },
        datalabels: {
          display: true,
          anchor: "end",
          align: "top",
          color: "#000000",
          font: { size: 10, weight: "bold" },
          formatter: (v) => fmtLabel(v)
        }
      },
      scales: (chartType !== "pie" && chartType !== "doughnut") ? {
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 },
            callback: (v) => fmtLabel(v)
          },
          grid: { color: "rgba(0,0,0,0.07)" }
        },
        x: {
          ticks: { font: { size: 9 }, maxRotation: 45 },
          grid: { display: false }
        }
      } : {}
    }
  };

  return `https://quickchart.io/chart?w=1000&h=550&bkg=white&c=${encodeURIComponent(JSON.stringify(chartDef))}`;
}
async function downloadChartImage(chartURL) {
  const resp = await fetch(chartURL);
  if (!resp.ok) throw new Error("QuickChart failed: " + resp.status);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `chart_${Date.now()}.png`);
  fs.writeFileSync(tmpPath, buffer);
  return tmpPath;
}

// ── SUPABASE UPLOAD ───────────────────────────────────────────────────────
async function uploadToSupabase(filePath, mediaType) {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName   = path.basename(filePath);
  const bucket     = "mis-media";
  const mimeType   = mediaType === "image" ? "image/png" : "application/pdf";
  const { error } = await supabase.storage.from(bucket).upload(fileName, fileBuffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error("Supabase upload failed: " + error.message);
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
  return urlData?.publicUrl;
}

// FIX #3: Send media directly — NO extra link message
async function sendWhatsAppMedia(to, filePath, caption, mediaType = "document") {
  const WA_API_KEY = "07168d1c665334e9a593c57d935468807294a9f0c3027a3fe0";
  const WA_API_URL = "http://app.mis.work/api/v1/message/create";
  const phone = String(to).replace(/[^0-9]/g, "").replace(/^91/, "");
  try {
    const publicUrl = await uploadToSupabase(filePath, mediaType);
    const response = await fetch(WA_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "x-api-key": WA_API_KEY 
      },
      body: JSON.stringify({
        receiverMobileNo: phone,
        filePathUrl: [publicUrl]   // ✅ sirf yeh, array mein
      })
    });
    const result = await response.json();
    console.log("[WA MEDIA RESPONSE]", JSON.stringify(result));
  } catch(e) {
    console.error("[WA MEDIA ERROR]", e.message);
    await sendWhatsAppReply(phone, caption + "\n\n⚠️ File send nahi ho paya.");
  } finally {
    try { fs.unlinkSync(filePath); } catch(e) {}
  }
}
async function sendWhatsAppReply(to, message) {
  try {
    console.log("📤 TRYING TO SEND MESSAGE TO:", to);
    console.log("📩 MESSAGE:", message);
    const WA_API_KEY = "07168d1c665334e9a593c57d935468807294a9f0c3027a3fe0";
    const WA_API_URL = "http://app.mis.work/api/v1/message/create";
    const phone = String(to).replace(/[^0-9]/g, "").replace(/^91/, "");
    await fetch(WA_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": WA_API_KEY },
      body: JSON.stringify({ receiverMobileNo: phone, message: [String(message).slice(0, 1500)] })
    });
    console.log("✅ WHATSAPP MESSAGE SENT");
  } catch(e) { console.error("[WA REPLY ERROR]", e.message); }
}

// ── TABLE / PIVOT HTML ────────────────────────────────────────────────────
function buildPivotFromSQL(rows) {
  if (!rows.length || !rows[0].hasOwnProperty("month")) return null;
  const nameCol = rows[0].hasOwnProperty("name") ? "name" :
                  rows[0].hasOwnProperty("category") ? "category" :
                  rows[0].hasOwnProperty("design_number") ? "design_number" :
                  rows[0].hasOwnProperty("employee_name") ? "employee_name" : null;
  if (!nameCol) return null;

  const months   = [...new Set(rows.map(r => r.month))].sort();
  const pivot    = {};
  const rowTotals= {};
  const colTotals= {};
  months.forEach(m => colTotals[m] = 0);

  rows.forEach(r => {
    const name = r[nameCol] || "Other";
    const val  = parseFloat(r.total || r.amount || r.total_sales || 0);
    if (!pivot[name]) pivot[name] = {};
    pivot[name][r.month] = (pivot[name][r.month] || 0) + val;
    rowTotals[name] = (rowTotals[name] || 0) + val;
    colTotals[r.month] = (colTotals[r.month] || 0) + val;
  });

  const sortedNames = Object.entries(rowTotals).sort((a,b) => b[1]-a[1]).map(([n]) => n);
  const grandTotal  = Object.values(rowTotals).reduce((s,v) => s+v, 0);
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
    let row = `<tr style="background:${idx%2===0?"#fff":"#f9f9f9"}"><td style="${TDL}"><b>${name}</b></td>`;
    months.forEach(m => { const v = pivot[name]?.[m]||0; row += `<td style="${TD}">${v>0?fmtAmt(v):"-"}</td>`; });
    row += `<td style="${TOT}">${fmtAmt(rowTotals[name])}</td></tr>`;
    bodyRows += row;
  });

  let grandRow = `<tr><td style="${GRD};text-align:left">Grand Total</td>`;
  months.forEach(m => { grandRow += `<td style="${GRD}">${colTotals[m]>0?fmtAmt(colTotals[m]):"-"}</td>`; });
  grandRow += `<td style="${GRD};background:#ffc107">${fmtAmt(grandTotal)}</td></tr>`;

  return `<div style="overflow-x:auto;font-family:Arial"><table style="border-collapse:collapse;min-width:700px">
    <thead>${header}</thead><tbody>${bodyRows}${grandRow}</tbody></table>
    <div style="font-size:11px;color:#555;margin-top:8px">Rows: <b>${sortedNames.length}</b> | Grand Total: <b>${fmtAmt(grandTotal)}</b></div></div>`;
}

function buildTableHTML(rows) {
  if (!rows.length) return "<p style='padding:12px;color:#666'>No data found.</p>";
  const cols = Object.keys(rows[0]);
  const TH = `padding:6px 10px;border:1px solid #444;font-size:12px;font-family:Arial;font-weight:bold;background:#1a1a2e;color:#fff;text-align:left;white-space:nowrap`;
  const TD = `padding:5px 8px;border:1px solid #ddd;font-size:12px;font-family:Arial;white-space:nowrap`;

  const NON_AMT = /phone|mobile|contact|gst|pan|id|no\.?$|num|number|invoice_no|voucher|ref|bill_ref|email|address|state|city|name|person|login|description|narration|particular|type|group|category|sub_group|design|month|date|period|year/i;
  const allAmtCols = cols.filter(col => {
    if (NON_AMT.test(col)) return false;
    const sampleVals = rows.slice(0,5).map(r => r[col]).filter(v => v !== null && v !== "");
    if (!sampleVals.length) return false;
    return sampleVals.some(v => { const n = parseFloat(String(v).replace(/[₹Rs.\s,]/g,"")); return !isNaN(n) && String(v).replace(/[₹Rs.\s,]/g,"").length < 15; });
  });

  let header = cols.map(c => `<th style="${TH}">${c.replace(/_/g," ").replace(/\b\w/g,l=>l.toUpperCase())}</th>`).join("");
  let bodyRows = "";
  const colSums = {};
  allAmtCols.forEach(c => colSums[c] = 0);

  rows.forEach((r, i) => {
    let row = `<tr style="background:${i%2===0?"#fff":"#f9f9f9"}">`;
    cols.forEach(c => {
      const val = r[c];
      if (allAmtCols.includes(c)) {
        const num = parseFloat(String(val||"").replace(/[₹Rs.\s,]/g,"")) || 0;
        colSums[c] = (colSums[c]||0) + num;
        row += `<td style="${TD};text-align:right">${num>0?fmtAmt(num):"-"}</td>`;
      } else {
        row += `<td style="${TD}">${val===null||val===""||val==="NA"?"-":val}</td>`;
      }
    });
    row += `</tr>`;
    bodyRows += row;
  });

  let totalRow = "";
  if (allAmtCols.length > 0) {
    totalRow = `<tr style="background:#e0e0e0;font-weight:bold">`;
    cols.forEach((c, idx) => {
      if (idx === 0) totalRow += `<td style="${TD};font-weight:bold">Grand Total</td>`;
      else if (allAmtCols.includes(c)) totalRow += `<td style="${TD};text-align:right;font-weight:bold">${fmtAmt(colSums[c])}</td>`;
      else totalRow += `<td style="${TD}"></td>`;
    });
    totalRow += `</tr>`;
  }

  return `<div style="overflow-x:auto;font-family:Arial">
    <table style="border-collapse:collapse;width:100%;min-width:400px">
      <thead><tr>${header}</tr></thead><tbody>${bodyRows}${totalRow}</tbody></table>
    <div style="font-size:11px;color:#555;margin-top:8px">Total Records: <b>${rows.length}</b></div></div>`;
}

// ── WEB CHAT ROUTE ────────────────────────────────────────────────────────
app.get("/history/:sid", async (req, res) => {
  try {
    const { data } = await supabase.from("chat_history").select("role,content,created_at").eq("session_id", req.params.sid).order("created_at", { ascending: true }).limit(50);
    res.json(data || []);
  } catch(e) { res.json([]); }
});
app.delete("/history/:sid", async (req, res) => {
  try { await supabase.from("chat_history").delete().eq("session_id", req.params.sid); } catch(e) {}
  res.json({ ok: true });
});

app.post("/chat", async (req, res) => {
  const message = req.body.message || "";
const session_id = req.body.session_id || "web";

const { data: history } = await supabase
  .from("chat_history")
  .select("role,content")
  .eq("session_id", session_id)
  .order("created_at", { ascending: true })
  .limit(20);
  
  try {

    const plan = await executePlan({
      message,
      sessionId: session_id,
      platform: "web",
      chatHistory: history || []
    });


    if (plan.query_type === "not_relevant") return res.json({ reply: "I can only help with MIS Work India sales & finance data.", type: "text" });

    if (plan.query_type === "clarify") {
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:plan.clarify_message }]);
      return res.json({ reply: plan.clarify_message, type: plan.clarify_options?.length ? "suggestions" : "text", options: plan.clarify_options || [] });
    }

    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) return res.json({ reply: "Please tell me the company name.", type: "text" });
      const data = await fuzzyLedgerSearch(search);
      if (!data || !data.length) return res.json({ reply: `No ledger found for "${search}".`, type: "text" });
      const uniqueNames = [...new Set(data.map(r => r.name))];
      if (uniqueNames.length > 1) {
        if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:"Multiple companies found" }]);
        return res.json({ reply: "Multiple companies found. Which one?", type: "suggestions", options: uniqueNames.slice(0,8) });
      }
      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const html = buildLedgerHTML(data[0], txns);
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:html }]);
      return res.json({ reply: html, type: "html" });
    }

    if (plan.query_type === "chart" && plan.chart_config) {
      const cfg = plan.chart_config;
      let rows; try { rows = await runSQL(cfg.sql); } catch(e) { return res.json({ reply: "Chart error: " + e.message, type: "text" }); }
      if (!rows || !rows.length) return res.json({ reply: "No data for chart.", type: "text" });
      const reply = buildTableHTML(rows);
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:reply }]);
      return res.json({ reply, type: "html", chartMeta: { chartType: cfg.type, title: cfg.title, labelCol: cfg.label_col, valueCol: cfg.value_col } });
    }

    if (!plan.sql) return res.json({ reply: "Could not generate a query. Please rephrase.", type: "text" });
    let rows; try { rows = await runSQL(plan.sql); } catch(e) { return res.json({ reply: `Database error: ${e.message}`, type: "text" }); }

    if (!rows || !rows.length) {
      if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:"No data found" }]);
      return res.json({ reply: `No data found for: "${message}"`, type: "suggestions", options: ["Show all sales","Show all expenses","Show pending payments"] });
    }

    const reply = buildPivotFromSQL(rows) || buildTableHTML(rows);
    if (session_id) await supabase.from("chat_history").insert([{ session_id, role:"user", content:message },{ session_id, role:"assistant", content:reply }]);
    return res.json({ reply, type: "html" });

  } catch(err) {
    console.error("[CHAT ERROR]", err);
    res.status(500).json({ error: err.message });
  }
});

// ── WHATSAPP WEBHOOK ──────────────────────────────────────────────────────
app.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"], token = req.query["hub.verify_token"], challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === (process.env.WHATSAPP_VERIFY_TOKEN || "mis_webhook_token")) return res.status(200).send(challenge);
  res.status(403).send("Forbidden");
});

app.post("/whatsapp", async (req, res) => {
  console.log("🔥 WHATSAPP WEBHOOK HIT");
  console.log(JSON.stringify(req.body, null, 2));
  console.log("\n========== WHATSAPP WEBHOOK ==========");
  try {
    const body = req.body;
    if (body.boundType === "out") return res.json({ success: true, ignored: true });

    const message = body.value || body.message || body.query || body.text || body.Body || body.body ||
      body.data?.message || body.data?.text ||
      (Array.isArray(body.messages) ? body.messages[0]?.text?.body : null) ||
      (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body) || "";

    const rawSender = body.senderNumber || body.from || body.From || body.sender || body.phone || body.data?.from || body.mobile || "918750285420";
    const actualPhone = String(rawSender).replace(/[^0-9]/g,"") || "918750285420";
    if (!message) {
      console.log("⚠️ No message body");
      return res.json({ success: true, ignored: true });
    }

    const query = message.trim().replace(/^mis[\s-]?bot\s*/i,"").trim();
    console.log("[WP QUERY]", query, "| FROM:", actualPhone);
    if (!liveSchema) await fetchLiveSchema();

    // ── FIX #8: STOP command — halt image sending ─────────────────────────
    if (/^stop$/i.test(query.trim())) {
      if (wpSessions[actualPhone] && wpSessions[actualPhone].type === "image_sending") {
        wpSessions[actualPhone].stopFlag = true;
        delete wpSessions[actualPhone];
        await sendWhatsAppReply(actualPhone, "⛔ Image sending stopped.");
        return res.json({ success: true });
      }
      return res.json({ success: true });
    }

    // ── FIX #8: User replies with a number to image_confirm ──────────────
    if (wpSessions[actualPhone]?.type === "image_confirm") {
      const session = wpSessions[actualPhone];
      const numMatch = query.match(/^(\d+)$/);
      if (numMatch) {
        const count = Math.min(parseInt(numMatch[1]), session.products.length);
        delete wpSessions[actualPhone];
        res.json({ success: true });
        await sendProductImages(actualPhone, session.products.slice(0, count), count);
        return;
      }
      if (/^(all|sabhi|saare|haan|yes|sab)/i.test(query)) {
        const products = session.products;
        delete wpSessions[actualPhone];
        res.json({ success: true });
        await sendProductImages(actualPhone, products, products.length);
        return;
      }
      // Not a valid reply — treat as new query, clear session
      delete wpSessions[actualPhone];
    }

    // ── FIX #6: Numbered selection for ledger ────────────────────────────
    if (wpSessions[actualPhone]?.type === "ledger_select" && /^[1-9]$/.test(query.trim())) {
      const session = wpSessions[actualPhone];
      const idx = parseInt(query.trim()) - 1;
      const selectedName = session.options[idx];
      if (!selectedName) {
        await sendWhatsAppReply(actualPhone, `❌ 1 se ${session.options.length} ke beech number daalo.`);
        return res.json({ success: true });
      }
      delete wpSessions[actualPhone];
      const data = await fuzzyLedgerSearch(selectedName);
      if (!data || !data.length) { await sendWhatsAppReply(actualPhone, `❌ Ledger nahi mila.`); return res.json({ success: true }); }
      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const bal  = parseFloat(data[0].closing_balance) || 0;
      await sendWhatsAppReply(actualPhone, `📒 *Ledger: ${selectedName}*\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`);
      res.json({ success: true });
      try {
        const pdfPath = await generateLedgerPDF(data[0], txns);
        await sendWhatsAppMedia(actualPhone, pdfPath, `📄 *${selectedName} — Ledger*\nBalance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}`, "document");
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ PDF error: " + e.message); }
      return;
    }

    // ── AI PROCESSING ─────────────────────────────────────────────────────
    let plan;
    console.log("⚡ BEFORE EXECUTE PLAN");
    try { plan = await executePlan({
      message: query,
      sessionId: actualPhone,
      platform: "whatsapp",
      phone: actualPhone,
      chatHistory: []
    });
    console.log("✅ PLAN RECEIVED");}
    catch(e) { await sendWhatsAppReply(actualPhone, "❌ Samajh nahi aaya, dobara try karo."); return res.json({ success: false }); }

    if (plan.query_type === "not_relevant") return res.json({ success: true, ignored: true });

    // ── LEDGER ────────────────────────────────────────────────────────────
    if (plan.query_type === "ledger") {
      const search = (plan.ledger_search || "").trim();
      if (!search) { await sendWhatsAppReply(actualPhone, "Company ka naam batao."); return res.json({ success: true }); }

      const data = await fuzzyLedgerSearch(search);
      if (!data || !data.length) {
        // Try to suggest similar names
        const { data: allNames } = await supabase.from("ledger").select("name").limit(1000);
        const unique = [...new Set((allNames||[]).map(r=>r.name))];
        const words  = search.toLowerCase().split(/\s+/).filter(w=>w.length>2);
        const similar= unique.filter(n => words.some(w => n.toLowerCase().includes(w))).slice(0,5);
        if (similar.length) {
          wpSessions[actualPhone] = { type: "ledger_select", options: similar };
          await sendWhatsAppReply(actualPhone, `❓ "${search}" nahi mila. Kya aap yeh chahte hain?\n\n` + similar.map((n,i)=>`${i+1}. ${n}`).join("\n") + "\n\nNumber bhejo (1, 2, 3...)");
        } else {
          await sendWhatsAppReply(actualPhone, `❌ "${search}" ka ledger nahi mila.`);
        }
        return res.json({ success: true });
      }

      const uniqueNames = [...new Set(data.map(r=>r.name))];
      if (uniqueNames.length > 1) {
        wpSessions[actualPhone] = { type: "ledger_select", options: uniqueNames.slice(0,8) };
        await sendWhatsAppReply(actualPhone, `🏢 Multiple companies mili:\n\n` + uniqueNames.slice(0,8).map((n,i)=>`${i+1}. ${n}`).join("\n") + "\n\nNumber bhejo (1, 2, 3...)");
        return res.json({ success: true });
      }

      const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
      const bal  = parseFloat(data[0].closing_balance) || 0;
      const name = data[0].name;
      await sendWhatsAppReply(actualPhone, `📒 *Ledger: ${name}*\n💰 Balance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}\n📝 Transactions: ${txns.length}\n\n⏳ Generating PDF...`);
      res.json({ success: true });
      try {
        const pdfPath = await generateLedgerPDF(data[0], txns);
        await sendWhatsAppMedia(actualPhone, pdfPath, `📄 *${name} — Ledger*\nBalance: Rs. ${Math.abs(bal).toLocaleString("en-IN")} ${bal>=0?"(Dr)":"(Cr)"}`, "document");
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ PDF error: " + e.message); }
      return;
    }

    // ── CHART — only if user asked ────────────────────────────────────────
    if (plan.query_type === "chart" && plan.chart_config) {
      const cfg = plan.chart_config;
      let rows; try { rows = await runSQL(cfg.sql); } catch(e) { await sendWhatsAppReply(actualPhone, "❌ Chart error: " + e.message); return res.json({ success: false }); }
      if (!rows || !rows.length) { await sendWhatsAppReply(actualPhone, "❌ Data nahi mila chart ke liye."); return res.json({ success: true }); }
      res.json({ success: true });
      try {
        const chartURL = buildChartURL(cfg, rows);
        const imgPath  = await downloadChartImage(chartURL);
        await sendWhatsAppMedia(actualPhone, imgPath, `📊 *${cfg.title || "Chart"}*\n_${rows.length} data points_`, "image");
      } catch(e) { await sendWhatsAppReply(actualPhone, "⚠️ Chart nahi ban paya."); }
      return;
    }

    // ── PRODUCTS ──────────────────────────────────────────────────────────
    if (plan.sql && plan.sql.toLowerCase().includes("from products")) {
      let rows; try { rows = await runSQL(plan.sql); } catch(e) { await sendWhatsAppReply(actualPhone, "❌ Error: " + e.message); return res.json({ success: true }); }
      if (!rows || !rows.length) { await sendWhatsAppReply(actualPhone, "❌ Koi product nahi mila."); return res.json({ success: true }); }

      const wantsImages = /image|tasveer|photo|pic|bhej|send|dikhao/i.test(query);

      if (wantsImages) {
        const withImg    = rows.filter(p => p.image_link && p.image_link.startsWith("http"));
        const withoutImg = rows.filter(p => !p.image_link || !p.image_link.startsWith("http"));

        // FIX #8: Ask before sending large batch
        if (withImg.length > 10) {
          wpSessions[actualPhone] = { type: "image_confirm", products: withImg, noImageProducts: withoutImg };
          const previewNames = withImg.slice(0,5).map((p,i)=>`${i+1}. ${p.item_name}`).join("\n");
          await sendWhatsAppReply(actualPhone,
            `🛍️ *${rows.length} products mile* (${withImg.length} ke paas image hai)\n\n*Preview:*\n${previewNames}\n...aur ${withImg.length-5} aur\n\n` +
            `📸 Kitni images bhejoon?\n• _Number type karo (jaise: 5, 10, 20)_\n• _"all" likho sabhi ke liye_\n• _"stop" likho cancel ke liye_`
          );
          return res.json({ success: true });
        }

        // Small batch — send directly
        const summaryText = `🛍️ *${rows.length} products mile*\n\n` + rows.map((p,i) => `${i+1}. ${p.item_name}`).join("\n");
        await sendWhatsAppReply(actualPhone, summaryText);
        res.json({ success: true });
        await sendProductImages(actualPhone, withImg, withImg.length);
        if (withoutImg.length) {
          await sendWhatsAppReply(actualPhone, `ℹ️ *Image nahi hai:*\n${withoutImg.map(p=>`• ${p.item_name}`).join("\n")}`);
        }
        return;
      }

      // List mode — send ALL product names in chunks
      const CHUNK = 25;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const txt = (i === 0 ? `🛍️ *Total Products: ${rows.length}*\n\n` : `📦 *List continued...*\n\n`) +
          chunk.map((p, idx) => `${i+idx+1}. *${p.item_name}*`).join("\n");
        await sendWhatsAppReply(actualPhone, txt);
        if (i + CHUNK < rows.length) await new Promise(r => setTimeout(r, 600));
      }
      return res.json({ success: true });
    }

    // ── FIX #1: DATA query — show ALL records with "more" handling ────────
    if (!plan.sql) return res.json({ success: false });
    let rows; try { rows = await runSQL(plan.sql); } catch(e) { await sendWhatsAppReply(actualPhone, `❌ DB error: ${e.message}`); return res.json({ success: false }); }

    if (!rows || !rows.length) {
      await sendWhatsAppReply(actualPhone, `❌ Koi data nahi mila: "${query}"`);
      return res.json({ success: true });
    }

    // Check if this is a pivot table query (has month column + party/name column)
    const cols = Object.keys(rows[0]);
    const hasPivotStructure = cols.includes("month") && (
      cols.includes("party_name") || cols.includes("name") || 
      cols.includes("company_name") || cols.includes("employee_name")
    );

    // If 20+ records, send PDF/CSV directly (pivot or regular table)
    if (rows.length >= 20) {
      const recordType = hasPivotStructure ? "Pivot Table" : "Data Table";
      
      // For 100+ records, send CSV instead of PDF (better for Excel)
      if (rows.length >= 100) {
        await sendWhatsAppReply(actualPhone, `📊 ${rows.length} records found\n\n📄 Generating Excel CSV file...`);
        res.json({ success: true });
        try {
          const csvCols = Object.keys(rows[0]);
          const csvPath = path.join(os.tmpdir(), `data_${Date.now()}.csv`);
          
          // Check if pivot format needed (has month column)
          if (hasPivotStructure) {
            // Build pivot table
            const nameCol = csvCols.find(c => ["party_name","name","company_name","employee_name"].includes(c));
            const months = [...new Set(rows.map(r => r.month))].sort();
            const pivot = {};
            const rowTotals = {};
            const colTotals = {};
            months.forEach(m => colTotals[m] = 0);
            
            rows.forEach(r => {
              const name = r[nameCol] || "Other";
              const val = parseFloat(r.total || r.amount || 0);
              if (!pivot[name]) pivot[name] = {};
              pivot[name][r.month] = (pivot[name][r.month] || 0) + val;
              rowTotals[name] = (rowTotals[name] || 0) + val;
              colTotals[r.month] = (colTotals[r.month] || 0) + val;
            });
            
            const sortedNames = Object.keys(pivot).sort((a,b) => (rowTotals[b]||0) - (rowTotals[a]||0));
            const grandTotal = Object.values(rowTotals).reduce((s,v) => s+v, 0);
            
            // CSV header
            let csv = "Party Name," + months.map(m => fmtMonth(m)).join(",") + ",Total\n";
            
            // Data rows with Indian commas (quoted to preserve commas)
            sortedNames.forEach(name => {
              csv += `"${name}",`;
              csv += months.map(m => {
                const val = pivot[name][m] || 0;
                return val > 0 ? `"${val.toLocaleString("en-IN")}"` : "-";
              }).join(",");
              csv += `,"${(rowTotals[name] || 0).toLocaleString("en-IN")}"\n`;
            });
            
            // Grand total row
            csv += "Grand Total,";
            csv += months.map(m => `"${(colTotals[m] || 0).toLocaleString("en-IN")}"`).join(",");
            csv += `,"${grandTotal.toLocaleString("en-IN")}"\n`;
            
            fs.writeFileSync(csvPath, csv, "utf8");
          } else {
            // Regular table format
            const header = csvCols.join(",");
            const body = rows.map(r => csvCols.map(c => {
              const val = String(r[c] ?? "").replace(/"/g, '""');
              return val.includes(",") || val.includes("\n") ? `"${val}"` : val;
            }).join(",")).join("\n");
            fs.writeFileSync(csvPath, header + "\n" + body, "utf8");
          }
          
          await sendWhatsAppMedia(actualPhone, csvPath, `📊 ${recordType}\n${rows.length} records\n\n💡 Open in Excel - Ready pivot table!`, "document");
        } catch(e) { 
          console.error("[CSV ERROR]", e.message);
          await sendWhatsAppReply(actualPhone, `⚠️ CSV error: ${e.message}`);
        }
        return;
      }
      
      // For 20-99 records, send PDF
      await sendWhatsAppReply(actualPhone, `📊 ${rows.length} records found\n\n⏳ Generating ${recordType} PDF...`);
      res.json({ success: true });
      
      try {
        const pdfCols = Object.keys(rows[0]);
        const pdfPath = await generateDataPDF(rows, pdfCols, query.substring(0, 50));
        await sendWhatsAppMedia(actualPhone, pdfPath, `📊 ${recordType}\n${rows.length} records`, "document");
      } catch(e) { 
        console.error("[PDF ERROR]", e.message);
        await sendWhatsAppReply(actualPhone, `⚠️ PDF error: ${e.message}\n\nTry: "Show top 50 ${query}"`);
      }
      return;
    }

    // FIX #5 & #1 & #4: Smart WP text formatting — show ALL up to 20, then summarize
    const emojis = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","1️⃣1️⃣","1️⃣2️⃣","1️⃣3️⃣","1️⃣4️⃣","1️⃣5️⃣","1️⃣6️⃣","1️⃣7️⃣","1️⃣8️⃣","1️⃣9️⃣","2️⃣0️⃣"];

    // Show max 20 records on WP
    const displayRows = rows.slice(0, 20);
    const replyLines  = displayRows.map((r, i) => {
      // Smart name detection
      const namePriority = ["employee_name","design_number","company_name","name","party_name","item_name","task_name","invoice_no","sub_group"];
      let name = null;
      for (const col of namePriority) {
        if (r[col] && String(r[col]).trim() !== "" && String(r[col]) !== "-") { name = String(r[col]); break; }
      }
      if (!name) name = String(Object.values(r)[0] || "Item");

      // Smart amount detection - try priority first, then any numeric column
      const amtPriority = ["total_rent","total_salary","total_sales","total","amount","pending_amount","total_price","salary","count"];
      let amount = null;
      for (const col of amtPriority) {
        if (r[col] != null && String(r[col]).trim() !== "" && String(r[col]) !== "-") { amount = r[col]; break; }
      }
      // If no priority match, find any numeric column
      if (amount == null) {
        for (const col of cols) {
          if (namePriority.includes(col) || col === "id" || col === "month") continue;
          const val = r[col];
          if (val != null && String(val).trim() !== "" && String(val) !== "-") {
            const num = parseFloat(String(val).replace(/[₹,Rs.\s]/g,""));
            if (!isNaN(num) && num > 0) { amount = val; break; }
          }
        }
      }

      // Compact format: emoji name = amount
      let line = `${emojis[i] || `${i+1}.`} ${name}`;
      if (amount != null) {
        const num = parseFloat(String(amount).replace(/[₹,Rs.\s]/g,""));
        if (!isNaN(num) && num > 0) line += ` = ${num.toLocaleString("en-IN")}`;
        else if (String(amount).trim() !== "" && String(amount) !== "0") line += ` = ${amount}`;
      }
      return line;
    });

    let replyText = `📊 ${rows.length} records found\n${replyLines.join("\n")}`;
    // FIX #1 & #4: If more than 20 records, show summary breakdown at end
    if (rows.length > 20) {
      replyText += `\n\n_...aur ${rows.length - 20} aur records hain_`;
      // If there are amount columns, show grand total
      const amtKey = ["total_salary","total_sales","total","amount","pending_amount"].find(k => rows[0]?.[k] != null);
      if (amtKey) {
        const grandTotal = rows.reduce((s, r) => s + (parseFloat(String(r[amtKey]||"").replace(/[₹,Rs.\s]/g,"")) || 0), 0);
        replyText += `\n💰 *Grand Total: Rs. ${grandTotal.toLocaleString("en-IN")}*`;
      }
    }

    res.json({ success: true, reply: replyText });
    console.log("📤 SENDING FINAL REPLY");
    await sendWhatsAppReply(actualPhone, replyText);
    // PDF for 20+ records
    if (rows.length > 20) {
      try {
        const pdfCols = Object.keys(rows[0]);
        const pdfPath = await generateDataPDF(rows, pdfCols, query);
        await sendWhatsAppMedia(actualPhone, pdfPath, `📄 *Poori list — ${rows.length} records*`, "document");
      } catch(e) { console.error("[DATA PDF ERROR]", e.message); }
    }

  } catch(err) {
    console.error("[WP ERROR]", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── FIX #8: Send product images with stop support ─────────────────────────
async function sendProductImages(phone, products, total) {
  const WA_API_KEY = "07168d1c665334e9a593c57d935468807294a9f0c3027a3fe0";
  const WA_API_URL = "http://app.mis.work/api/v1/message/create";
  const cleanPhone = phone.replace(/^91/,"");

  // Mark session as image_sending
  wpSessions[phone] = { type: "image_sending", stopFlag: false };

  let sent = 0;
  for (const p of products) {
    // Check stop flag
    if (wpSessions[phone]?.stopFlag) {
      await sendWhatsAppReply(phone, `⛔ Stopped. ${sent}/${total} images bhej di gayi.`);
      delete wpSessions[phone];
      return;
    }
    if (!p.image_link || !p.image_link.startsWith("http")) continue;
    try {
      const response = await fetch(WA_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": WA_API_KEY },
        body: JSON.stringify({ receiverMobileNo: cleanPhone, filePathUrl: [p.image_link], caption: [`🧸 *${p.item_name}*${p.description ? "\n" + String(p.description).substring(0,80) : ""}`] })
      });
      sent++;
      await new Promise(r => setTimeout(r, 700)); // delay to avoid spam
    } catch(e) { console.error("[PROD IMG ERROR]", e.message); }
  }

  delete wpSessions[phone];
  if (sent > 0) await sendWhatsAppReply(phone, `✅ ${sent} images bhej di gayi!`);
}

// ── SYNC ROUTES ───────────────────────────────────────────────────────────
const SHEET_ID = "1iNVOUtLk7sRGx-JkttGRd8jkWaIzAwkMoyBzA70OmDc";

async function fetchSheetCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return res.text();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim());
  return lines.slice(1).map(line => {
    const cols = []; let cur = "", inQ = false;
    for (let c of line) {
      if (c === '"') { inQ = !inQ; }
      else if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
      else { cur += c; }
    }
    cols.push(cur.trim());
    const obj = {};
    headers.forEach((h,i) => { obj[h] = cols[i] || ""; });
    return obj;
  });
}

function convertExcelDate(val) {
  if (!val) return null;
  if (String(val).includes("-") || String(val).includes("/")) return String(val).split("T")[0];
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  return new Date((num - 25569) * 86400 * 1000).toISOString().split("T")[0];
}

async function syncProducts() {
  try {
    const csv = await fetchSheetCSV("1581260341");
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from("products").delete().neq("id", 0);
    const toInsert = rows.filter(r => r["ITEM NAME"] || r["Item Name"] || r["item name"]).map(r => ({
      item_name: r["ITEM NAME"] || r["Item Name"] || r["item name"] || "",
      image_link: r["image link"] || r["Image Link"] || r["IMAGE LINK"] || Object.values(r).find((v,i) => Object.keys(r)[i]?.toLowerCase().includes("image") && String(v).startsWith("http")) || "",
      description: r["Description"] || r["description"] || r["DESCRIPTION"] || ""
    }));
    if (toInsert.length) await supabase.from("products").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "products", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Products:", toInsert.length);
    return toInsert.length;
  } catch(e) {
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
    const toInsert = rows.filter(r => r["taskName"] || r["task_name"]).map(r => ({
      del_task_id: r["delTaskId"] || "",
      plan_date:   r["planDate"] ? convertExcelDate(r["planDate"]) : null,
      final_date:  r["finalDate"] ? convertExcelDate(r["finalDate"]) : null,
      delegate_from: r["delegateFrom"] || "",
      delegated_to: r["delegatedTo"] || "",
      project_name: r["projectNm"] || "",
      task_name:   r["taskName"] || "",
      del_remarks: r["delRemarks"] || "",
      priority:    r["priority"] || "",
      department_id: r["departmentId"] || "",
      del_url:     r["delUrl"] || ""
    }));
    if (toInsert.length) await supabase.from("delegation_tasks").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "delegation_tasks", rows_synced: toInsert.length, status: "success" });
    return toInsert.length;
  } catch(e) {
    await supabase.from("sync_log").insert({ sheet_name: "delegation_tasks", rows_synced: 0, status: "error: " + e.message });
    return 0;
  }
}

async function syncChecklistTasks() {
  try {
    const csv = await fetchSheetCSV("426961603");
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from("checklist_tasks").delete().neq("id", 0);
    const toInsert = rows.filter(r => Object.values(r).some(v => v)).map(r => ({
      task_name:   r["taskName"] || r["Task Name"] || "",
      assigned_to: r["taskTo"] || r["assignedTo"] || "",
      status:      r["taskType"] || r["status"] || "",
      priority:    r["priority"] || "",
      remarks:     r["taskFrom"] || r["remarks"] || "",
      department:  r["departmentId"] || r["department"] || ""
    }));
    if (toInsert.length) await supabase.from("checklist_tasks").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "checklist_tasks", rows_synced: toInsert.length, status: "success" });
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
      employee_name: r["employee_name"] || r["Employee Name"] || r["name"] || "",
      score_value:   r["score_value"] || r["Score"] || r["score"] || "",
      category:      r["category"] || r["Category"] || "",
      period:        r["period"] || r["Period"] || "",
      remarks:       r["remarks"] || r["Remarks"] || ""
    }));
    if (toInsert.length) await supabase.from("scores").insert(toInsert);
    await supabase.from("sync_log").insert({ sheet_name: "scores", rows_synced: toInsert.length, status: "success" });
    return toInsert.length;
  } catch(e) {
    await supabase.from("sync_log").insert({ sheet_name: "scores", rows_synced: 0, status: "error: " + e.message });
    return 0;
  }
}

async function syncAllSheets() {
  console.log("[SYNC] Starting...");
  const results = {
    products: await syncProducts(),
    delegation_tasks: await syncDelegationTasks(),
    checklist_tasks: await syncChecklistTasks(),
    scores: await syncScores()
  };
  console.log("[SYNC] Done:", results);
  return results;
}

app.post("/sync", async (req, res) => {
  try { res.json({ ok: true, synced: await syncAllSheets(), timestamp: new Date().toISOString() }); }
  catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get("/sync/status", async (req, res) => {
  try {
    const { data } = await supabase.from("sync_log").select("*").order("synced_at", { ascending: false }).limit(20);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

setInterval(() => { console.log("[AUTO-SYNC]"); syncAllSheets(); }, 15 * 60 * 1000);
setTimeout(syncAllSheets, 5000);

// ── DOCUMENT INTELLIGENCE ─────────────────────────────────────────────────
app.post("/doc-intelligence", async (req, res) => {
  const { doc_url, doc_type, question, uploaded_by } = req.body;
  if (!doc_url) return res.status(400).json({ error: "doc_url required" });
  try {
    let extractedText = "", docTitle = doc_url.substring(0, 80);
    if (doc_type === "google_sheet" || doc_url.includes("docs.google.com/spreadsheets")) {
      const match = doc_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      const gidMatch = doc_url.match(/gid=(\d+)/);
      if (!match) throw new Error("Invalid Google Sheet URL");
      const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gidMatch?.[1]||"0"}`;
      const csvRes = await fetch(csvUrl);
      if (!csvRes.ok) throw new Error("Could not fetch Google Sheet.");
      extractedText = (await csvRes.text()).substring(0, 8000);
      docTitle = "Google Sheet";
    } else if (doc_type === "pdf" || doc_url.includes(".pdf") || doc_url.includes("drive.google.com")) {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method:"POST", headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
        body: JSON.stringify({ model:"gpt-4o", max_tokens:2000, messages:[{ role:"user", content:`Read and summarize: ${doc_url}\nQuestion: ${question||"Summarize"}` }] })
      });
      const summary = (await aiRes.json()).choices?.[0]?.message?.content || "Could not read.";
      await supabase.from("doc_intelligence").insert({ doc_type:"pdf", doc_url, doc_title:docTitle, ai_summary:summary, uploaded_by:uploaded_by||"web" });
      return res.json({ ok:true, summary, doc_type:"pdf" });
    } else {
      try { extractedText = (await (await fetch(doc_url,{headers:{"User-Agent":"Mozilla/5.0"}})).text()).replace(/<[^>]*>/g," ").substring(0,6000); } catch(e) { extractedText = `URL: ${doc_url}`; }
    }
    const aiRes2 = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({ model:"gpt-4o", max_tokens:2000, messages:[
        { role:"system", content:"You are a document analysis assistant for Mis Work India. Analyze content and answer questions accurately." },
        { role:"user", content:`Content:\n${extractedText}\n\nQuestion: ${question||"Summarize"}` }
      ]})
    });
    const summary = (await aiRes2.json()).choices?.[0]?.message?.content || "Could not analyze.";
    await supabase.from("doc_intelligence").insert({ doc_type:doc_type||"url", doc_url, doc_title:docTitle, ai_summary:summary, raw_content:extractedText.substring(0,2000), uploaded_by:uploaded_by||"web" });
    res.json({ ok:true, summary, doc_type:doc_type||"url" });
  } catch(err) { res.status(500).json({ ok:false, error:err.message }); }
});

app.get("/doc-intelligence/history", async (req, res) => {
  try {
    const { data } = await supabase.from("doc_intelligence").select("id,doc_type,doc_title,doc_url,ai_summary,created_at").order("created_at",{ascending:false}).limit(20);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

app.post("/analyze-image", async (req, res) => {
  const { base64, mediaType } = req.body;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST", headers:{"Authorization":"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body: JSON.stringify({ model:"gpt-4o", max_tokens:1000, messages:[{ role:"user", content:[
        { type:"image_url", image_url:{ url:`data:${mediaType};base64,${base64}` } },
        { type:"text", text:"Describe this image. Extract any text. If product, describe it." }
      ]}]})
    });
    res.json({ summary: (await response.json()).choices?.[0]?.message?.content || "Could not analyze" });
  } catch(e) { res.json({ summary:"Error: "+e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`MIS Chatbot running at http://localhost:${PORT}`);
  await fetchLiveSchema();
});

process.on("unhandledRejection", r => console.error("[UNHANDLED]", r));
process.on("uncaughtException", e => console.error("[UNCAUGHT]", e));