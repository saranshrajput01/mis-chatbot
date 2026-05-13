require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ── CHAT HISTORY ROUTES ──────────────────────────────────────────────────────
app.get("/history/:sid", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("chat_history")
      .select("role,content,created_at")
      .eq("session_id", req.params.sid)
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) return res.json([]);
    res.json(data || []);
  } catch(e) { res.json([]); }
});

app.delete("/history/:sid", async (req, res) => {
  try { await supabase.from("chat_history").delete().eq("session_id", req.params.sid); } catch(e) {}
  res.json({ ok: true });
});

// ── HELPERS ──────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt)) return String(d).split("T")[0];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return String(dt.getDate()).padStart(2,"0") + "-" + months[dt.getMonth()] + "-" + String(dt.getFullYear()).slice(2);
}

function fmtAmt(n) {
  const num = parseFloat(String(n || "").replace(/[₹,]/g, "")) || 0;
  if (!num) return "0.00";
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAmt(n) {
  return parseFloat(String(n || "").replace(/[₹,\s]/g, "")) || 0;
}

// ── FUZZY / TYPO NORMALISER ────────────────────────────────────────────────
// Fixes common phonetic typos before keyword matching
function fixTypos(text) {
  return text
    .replace(/\blgdr\b/gi, "ledger")
    .replace(/\bkhata\b/gi, "ledger")
    .replace(/\bldgr\b/gi, "ledger")
    .replace(/\bldger\b/gi, "ledger")
    .replace(/\binvois\b|\binvoic\b|\binvoice?s?\b/gi, "invoice")
    .replace(/\bsalari\b|\bsalry\b|\bsalary\b/gi, "salary")
    .replace(/\bkiraya\b/gi, "rent")
    .replace(/\btankhwa\b/gi, "salary")
    .replace(/\bpending\b|\bbaaki\b|\bbaki\b/gi, "pending")
    .replace(/\bkharcha\b|\bkharch\b/gi, "expense")
    .replace(/\bdikhao\b|\bdikha\b|\bshow\b|\bsend\b|\bdo\b|\bde\b|\bdedo\b|\bdikhaoo\b/gi, "show")
    .replace(/\bretainer\b|\bretainrship\b|\bretaineship\b|\bretainership\b/gi, "retainership")
    .replace(/\bpansri\b|\bpansari\b|\bpansary\b/gi, "pansari");
}

function normalizeCompany(text = "") {
  return text
    .toLowerCase()
    .replace(/private\s+limited/gi, "")
    .replace(/pvt\.?\s*ltd\.?/gi, "")
    .replace(/\blimited\b|\bltd\b|\bllp\b/gi, "")
    .replace(/\bledger\b|\bkhata\b|\bstatement\b|\bbalance\b|\baccount\b|\blgdr\b|\bldgr\b/gi, "")
    .replace(/\bshow\b|\bsend\b|\bplease\b|\bmujhe\b|\bdikhao\b|\bbatao\b|\bbhejo\b|\bdikha\b|\bkaro\b|\bdedo\b|\bde\b|\bdo\b|\bof\b|\bfor\b|\bthe\b|\bka\b|\bki\b|\bke\b|\btill\b|\bdate\b|\ball\b|\bget\b|\bfind\b|\bfetch\b|\bgive\b|\bme\b|\bdikhaoo\b/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── DETECT QUERY TYPE ─────────────────────────────────────────────────────────
function detectType(q) {
  // Fix typos first for detection
  const fixed = fixTypos(q);
  const ql = fixed.toLowerCase();

  // COMBINE: multiple expense categories joined with +, aur, and, comma
  if (/\+|combine|total.*expense|expense.*total/.test(ql) &&
      /(salary|rent|travel|phone|insurance|branding|commission|utility|maintenance|stationery|legal|technical|welfare)/i.test(ql)) {
    return "COMBINE_EXPENSE";
  }

  if (/ledger|khata|statement|account\s*detail|balanc/i.test(ql)) return "LEDGER";
  if (/pending|overdue|baaki|baki|\bdue\b|60.?day|90.?day|120.?day|30.?day|180.?day|60-90|90-120|ageing|aging/i.test(ql)) return "PENDING";

  // NO_SALES: clients who had no sale this year but had last year, OR generic no-sale queries
  if (/no\s*sale|zero\s*sale|without\s*sale|not\s*sold|inactive|dead\s*client|koi\s*sale\s*nahi|sale\s*nahi|invoice\s*nahi.*but.*last\s*year|last\s*year.*tha|nahi\s*gaya.*last\s*year/i.test(ql)) return "NO_SALES";

  if (/salary|wages|payroll/i.test(ql)) return "EXPENSE";
  if (/rent|lease/i.test(ql)) return "EXPENSE";
  if (/invoice|bill|mis-/i.test(ql)) return "INVOICE";
  if (/expense|kharcha|kharch|expenditure|cost|spent|payment\s*done|spend|monthly\s*exp|category.*exp|exp.*category/i.test(ql)) return "EXPENSE";
  if (/sale|revenue|top\s*\d|client|customer|best|highest|earning|income|sells|category.*sale|sale.*category|month.*sale|sale.*month|product.*sale|erp|google\s*sheet|whatsapp|mobile\s*app|tally|web\s*form|php|retainer/i.test(ql)) return "SALES";
  if (/phone|mobile\s*num|number|contact|num\b|no\.\s|call/i.test(ql)) return "CONTACT";
  return "GENERAL";
}

// ── LEDGER HTML BUILDER ───────────────────────────────────────────────────────
function buildLedgerHTML(info, txns) {
  const openBal = parseFloat(info.opening_balance) || 0;
  const closeBal = parseFloat(info.closing_balance) || 0;
  const dates = txns.map(r => r.voucher_date).filter(Boolean).sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-24";
  const lastDate = dates[dates.length-1] ? fmtDate(dates[dates.length-1]) : firstDate;
  const totalDr = txns.reduce((s,r) => s+(parseFloat(r.voucher_debit)||0), 0);
  const totalCr = txns.reduce((s,r) => s+(parseFloat(r.voucher_credit)||0), 0);

  const TD = `padding:5px 8px;border:1px solid #999;font-size:12px;font-family:Arial,sans-serif`;
  const TH = `padding:6px 8px;border:1px solid #555;font-size:12px;font-family:Arial,sans-serif;font-weight:bold;background:#222;color:#fff`;

  let rows = `<tr>
    <td style="${TD};white-space:nowrap"><b>1-Apr-24</b></td>
    <td style="${TD}"><b>To</b></td>
    <td style="${TD}" colspan="3"><b>Opening Balance</b></td>
    <td style="${TD};text-align:right"><b>${openBal > 0 ? fmtAmt(openBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${openBal < 0 ? fmtAmt(Math.abs(openBal)) : ""}</b></td>
  </tr>`;

  txns.forEach(r => {
    const isDr = (parseFloat(r.voucher_debit)||0) > 0;
    rows += `<tr>
      <td style="${TD};white-space:nowrap">${fmtDate(r.voucher_date)}</td>
      <td style="${TD}">${isDr ? "To" : "By"}</td>
      <td style="${TD}">${r.voucher_particular||""}</td>
      <td style="${TD}">${r.voucher_type||""}</td>
      <td style="${TD};font-family:monospace">${r.voucher_no||""}</td>
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

// ── LEDGER HANDLER ────────────────────────────────────────────────────────────
async function handleLedger(question, exactName) {
  const fetchByName = async (name) => {
    const { data } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .eq("name", name).order("voucher_date", { ascending: true }).limit(500);
    return data || [];
  };

  if (exactName) {
    const data = await fetchByName(exactName);
    if (!data.length) return { type: "text", content: "No ledger records found for " + exactName };
    const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
    return { type: "html", content: buildLedgerHTML(data[0], txns) };
  }

  // Apply typo fix before searching
  const cleanQ = fixTypos(question);
  const searchTerm = normalizeCompany(cleanQ);
  if (!searchTerm || searchTerm.length < 2) return { type: "text", content: "Please tell me the company name." };

  const searchWords = searchTerm.split(" ").filter(w => w.length > 2);
  if (!searchWords.length) return { type: "text", content: "Please tell me the company name." };

  const primaryWord = [...searchWords].sort((a,b) => b.length-a.length)[0];

  const { data } = await supabase.from("ledger")
    .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
    .ilike("name", "%" + primaryWord + "%").order("voucher_date", { ascending: true }).limit(2000);

  if (!data || !data.length) return { type: "text", content: "No company found matching '" + searchTerm + "'." };

  const matchedRows = data.filter(row => {
    const dbNorm = normalizeCompany(row.name || "");
    return searchWords.every(word => dbNorm.includes(word));
  });

  if (!matchedRows.length) {
    const suggestions = [...new Set(data.map(r => r.name))].slice(0, 6);
    return suggestions.length
      ? { type: "suggestions", content: "Did you mean:", options: suggestions }
      : { type: "text", content: "No company found for '" + searchTerm + "'." };
  }

  const uniqueNames = [...new Set(matchedRows.map(r => r.name))];
  if (uniqueNames.length > 1) return { type: "suggestions", content: "Multiple companies found. Which one?", options: uniqueNames.slice(0, 8) };

  const companyRows = matchedRows.filter(r => r.name === uniqueNames[0]);
  const txns = companyRows.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
  return { type: "html", content: buildLedgerHTML(companyRows[0], txns) };
}

// ── COMBINE EXPENSE HANDLER ───────────────────────────────────────────────────
// Handles: "salary + office rent + travel ka total batao"
async function handleCombineExpense(question) {
  const q = question.toLowerCase();

  const catMap = {
    "salary": "Salary", "salari": "Salary", "wages": "Salary", "tankhwa": "Salary",
    "office rent": "OFFICE RENT", "rent": "OFFICE RENT", "kiraya": "OFFICE RENT",
    "travel": "Travel Exp", "conveyance": "Travel Exp",
    "phone": "Phone and Internet", "internet": "Phone and Internet",
    "electricity": "Utility Direc", "utility": "Utility Direc",
    "insurance": "INSURANCE",
    "maintenance": "Repair & Maintenance", "repair": "Repair & Maintenance",
    "branding": "BRANDING EXP", "marketing": "BRANDING EXP",
    "commission": "COMMISSION EXP",
    "stationery": "Stationery", "stationary": "Stationery",
    "legal": "Legal & Prof Exp", "professional": "Legal & Prof Exp",
    "technical": "Technical Exp",
    "welfare": "Employees Welfare",
    "financial": "Financial Exp",
  };

  // Find which categories are mentioned
  const mentionedCats = [];
  // Sort by key length desc so "office rent" matches before "rent"
  const sortedKeys = Object.keys(catMap).sort((a,b) => b.length - a.length);
  for (const k of sortedKeys) {
    if (q.includes(k) && !mentionedCats.includes(catMap[k])) {
      mentionedCats.push(catMap[k]);
    }
  }

  if (!mentionedCats.length) return null; // fallback to regular expense handler

  // Month/year filter
  const monthMap = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  let monthFilter = null, yearFilter = null;
  for (const [mn,mv] of Object.entries(monthMap)) { if(q.includes(mn)){monthFilter=mv;break;} }
  const yearMatch = q.match(/20(2[0-9])/);
  if (yearMatch) yearFilter = yearMatch[0];

  // Fetch all expenses for these categories
  const { data } = await supabase.from("expenses")
    .select("date,sub_group,amount,party_name")
    .in("sub_group", mentionedCats)
    .order("date", { ascending: false })
    .limit(2000);

  let filtered = data || [];
  if (monthFilter || yearFilter) {
    filtered = filtered.filter(r => {
      const d = (r.date || "").substring(0, 7);
      if (monthFilter && yearFilter) return d === yearFilter + "-" + monthFilter;
      if (monthFilter) return d.endsWith("-" + monthFilter);
      if (yearFilter) return d.startsWith(yearFilter);
      return true;
    });
  }

  if (!filtered.length) return `No expense records found for: ${mentionedCats.join(", ")}${monthFilter ? " in this period" : ""}.`;

  // Group by category
  const bycat = {};
  filtered.forEach(r => { bycat[r.sub_group] = (bycat[r.sub_group] || 0) + (r.amount || 0); });
  const grandTotal = filtered.reduce((s,r) => s + (r.amount||0), 0);

  let ctx = `COMBINED EXPENSE SUMMARY (${mentionedCats.join(" + ")})${yearFilter ? " — " + yearFilter : ""}${monthFilter ? "-" + monthFilter : ""}:\n`;
  ctx += "Category|Total Amount\n";
  mentionedCats.forEach(cat => {
    ctx += `${cat}|Rs.${(bycat[cat]||0).toLocaleString("en-IN")}\n`;
  });
  ctx += `GRAND TOTAL|Rs.${grandTotal.toLocaleString("en-IN")}`;

  return ctx;
}

// ── NO SALES HANDLER ──────────────────────────────────────────────────────────
async function handleNoSales(question) {
  const q = question.toLowerCase();

  // ── SPECIAL: "clients jinhe is saal invoice nahi gaya but last year the" ──
  const isLastYearComparison = /last\s*year|pichle\s*saal|last\s*saal/i.test(q);

  const now = new Date();
  const currentYear = now.getFullYear();
  const thisYearStart = `${currentYear}-01-01`;
  const thisYearEnd   = `${currentYear}-12-31`;
  const lastYearStart = `${currentYear - 1}-01-01`;
  const lastYearEnd   = `${currentYear - 1}-12-31`;

  if (isLastYearComparison) {
    // Get companies that had sales last year
    const { data: lastYearSales } = await supabase.from("sales")
      .select("company_name,total_price")
      .gte("created_at", lastYearStart)
      .lte("created_at", lastYearEnd)
      .gt("total_price", 0)
      .limit(5000);

    // Get companies that had sales this year
    const { data: thisYearSales } = await supabase.from("sales")
      .select("company_name,total_price")
      .gte("created_at", thisYearStart)
      .lte("created_at", thisYearEnd)
      .gt("total_price", 0)
      .limit(5000);

    const hadLastYear = {};
    (lastYearSales || []).forEach(r => {
      if (r.company_name) {
        const key = r.company_name.trim();
        hadLastYear[key] = (hadLastYear[key] || 0) + (r.total_price || 0);
      }
    });

    const hadThisYear = new Set(
      (thisYearSales || []).map(r => (r.company_name || "").trim().toLowerCase())
    );

    // Clients in last year but NOT in this year
    const lostClients = Object.entries(hadLastYear)
      .filter(([name]) => !hadThisYear.has(name.toLowerCase()))
      .sort((a,b) => b[1] - a[1]); // sort by last year revenue

    // Top N filter
    const topMatch = q.match(/top\s*(\d+)/i);
    const n = topMatch ? parseInt(topMatch[1]) : lostClients.length;
    const finalList = lostClients.slice(0, n);

    if (!finalList.length) return `All clients from ${currentYear - 1} have already been invoiced in ${currentYear}!`;

    let ctx = `CLIENTS WITH SALE IN ${currentYear-1} BUT NO INVOICE IN ${currentYear} (${finalList.length} clients):\n`;
    ctx += `Rank|Company Name|Last Year Revenue\n`;
    finalList.forEach(([name, amt], i) => {
      ctx += `${i+1}|${name}|Rs.${amt.toLocaleString("en-IN")}\n`;
    });
    ctx += `\nTotal Lost Revenue Potential: Rs.${finalList.reduce((s,[,a])=>s+a,0).toLocaleString("en-IN")}`;
    return ctx;
  }

  // ── GENERIC NO SALES ──
  const monthMap = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
  let startMonth = null, endMonth = null;

  const lastNMatch = q.match(/last\s*(\d+)\s*month/i);
  if (lastNMatch) {
    const n = parseInt(lastNMatch[1]);
    const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const start = new Date(end.getFullYear(), end.getMonth() - (n - 1), 1);
    startMonth = start.toISOString().substring(0, 7);
    endMonth = end.toISOString().substring(0, 7);
  } else {
    const months = [];
    for (const [mn, mv] of Object.entries(monthMap)) {
      const yearMatch = new RegExp(mn + "\\s*(20\\d\\d)", "gi").exec(q);
      if (yearMatch) months.push({ month: mv, year: yearMatch[1] });
    }
    if (months.length >= 2) {
      startMonth = months[0].year + "-" + months[0].month;
      endMonth = months[1].year + "-" + months[1].month;
    } else if (months.length === 1) {
      startMonth = months[0].year + "-" + months[0].month;
      endMonth = startMonth;
    } else {
      const end = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = new Date(end.getFullYear(), end.getMonth() - 11, 1);
      startMonth = start.toISOString().substring(0, 7);
      endMonth = end.toISOString().substring(0, 7);
    }
  }

  const { data: salesData } = await supabase.from("sales")
    .select("company_name,total_price,category,created_at")
    .gte("created_at", startMonth + "-01")
    .lte("created_at", endMonth + "-31")
    .gt("total_price", 0)
    .limit(5000);

  const { data: ledgerData } = await supabase.from("ledger")
    .select("name,subgroup,closing_balance")
    .limit(5000);

  if (!ledgerData || !ledgerData.length) return "No client data found.";

  const clientsWithSales = new Set(
    (salesData || []).map(r => (r.company_name || "").toLowerCase().trim())
  );

  const uniqueLedgerClients = {};
  ledgerData.forEach(r => {
    if (r.name && r.name.trim()) {
      const key = r.name.trim();
      if (!uniqueLedgerClients[key]) uniqueLedgerClients[key] = r;
    }
  });

  const noSalesClients = Object.values(uniqueLedgerClients).filter(r => {
    const norm = (r.name || "").toLowerCase().trim();
    return !clientsWithSales.has(norm);
  });

  let catFilter = null;
  if (/google\s*sheet/i.test(q)) catFilter = "google";
  else if (/erp/i.test(q)) catFilter = "erp";
  else if (/whatsapp/i.test(q)) catFilter = "whatsapp";
  else if (/tally/i.test(q)) catFilter = "tally";
  else if (/php/i.test(q)) catFilter = "php";
  else if (/mobile\s*app/i.test(q)) catFilter = "mobile";

  let finalList = noSalesClients;
  if (catFilter) {
    finalList = noSalesClients.filter(r => (r.subgroup || "").toLowerCase().includes(catFilter));
  }

  if (!finalList.length) return `All clients had at least one sale between ${startMonth} and ${endMonth}.`;

  const ctx = `CLIENTS WITH NO SALES from ${startMonth} to ${endMonth} (${finalList.length} clients):\nClient Name|Subgroup|Closing Balance\n` +
    finalList.slice(0, 100).map(r => `${r.name}|${r.subgroup||"N/A"}|Rs.${(r.closing_balance||0).toLocaleString("en-IN")}`).join("\n");

  return ctx;
}

// ── CONTEXT FETCHER ───────────────────────────────────────────────────────────
async function fetchContext(question, type) {
  const q = fixTypos(question).toLowerCase(); // Always fix typos before matching
  let ctx = "";

  // ── PENDING ──
  if (type === "PENDING") {
    const { data } = await supabase.from("pending")
      .select("party_name,bill_ref_no,pending_amount,due_date,overdue_days,party_group")
      .order("overdue_days", { ascending: false }).limit(2000);

    if (data && data.length) {
      let filtered = data;
      if (/120\s*\+|above\s*120|more.*120|120.*above/i.test(q)) filtered = data.filter(r => r.overdue_days >= 120);
      else if (/90.{0,5}120/i.test(q)) filtered = data.filter(r => r.overdue_days >= 90 && r.overdue_days < 120);
      else if (/60.{0,5}90/i.test(q)) filtered = data.filter(r => r.overdue_days >= 60 && r.overdue_days < 90);
      else if (/30.{0,5}60/i.test(q)) filtered = data.filter(r => r.overdue_days >= 30 && r.overdue_days < 60);
      else if (/\b180\b/i.test(q)) filtered = data.filter(r => r.overdue_days >= 180);
      else if (/\b120\b/i.test(q)) filtered = data.filter(r => r.overdue_days >= 120);
      else if (/\b90\b/i.test(q)) filtered = data.filter(r => r.overdue_days >= 90);
      else if (/\b60\b/i.test(q)) filtered = data.filter(r => r.overdue_days >= 60);
      else if (/\b30\b/i.test(q)) filtered = data.filter(r => r.overdue_days >= 30);

      const tot = filtered.reduce((s,r) => s + parseAmt(r.pending_amount), 0);
      ctx = `PENDING RECEIPTS (${filtered.length} records, Total Rs.${tot.toLocaleString("en-IN")}):\n`;
      ctx += "Party Name|Bill Ref|Pending Amount|Overdue Days\n";
      filtered.forEach(r => {
        ctx += `${r.party_name||""}|${r.bill_ref_no||""}|Rs.${parseAmt(r.pending_amount).toLocaleString("en-IN")}|${r.overdue_days||0} days\n`;
      });
    } else ctx = "No pending records found.";
  }

  // ── EXPENSE ──
  else if (type === "EXPENSE") {
    const catMap = {
      "salary":"Salary", "salari":"Salary", "wages":"Salary", "tankhwa":"Salary",
      "office rent":"OFFICE RENT", "rent":"OFFICE RENT", "kiraya":"OFFICE RENT",
      "phone":"Phone and Internet", "internet":"Phone and Internet", "telephone":"Telephone Exp",
      "travel":"Travel Exp", "conveyance":"Travel Exp", "petrol":"Travel Exp",
      "electricity":"Utility Direc", "bijli":"Utility Direc", "utility":"Utility Direc",
      "insurance":"INSURANCE",
      "maintenance":"Repair & Maintenance", "repair":"Repair & Maintenance", "computer":"Computer Maintenance",
      "branding":"BRANDING EXP", "marketing":"BRANDING EXP", "advertis":"BRANDING EXP",
      "commission":"COMMISSION EXP",
      "stationery":"Stationery", "stationary":"Stationery",
      "legal":"Legal & Prof Exp", "professional":"Legal & Prof Exp",
      "technical":"Technical Exp",
      "welfare":"Employees Welfare", "employee":"Employees Welfare",
      "financial":"Financial Exp",
      "bad debt":"Bad Debts",
      "factory":"Factory Related",
      "indirect":"Indirect Expenses",
      "office exp":"OFFICE EXP"
    };

    let matchedCat = null;
    // Sort by key length desc so "office rent" matches before "rent"
    const sortedKeys = Object.keys(catMap).sort((a,b) => b.length - a.length);
    for (const k of sortedKeys) {
      if (q.includes(k)) { matchedCat = catMap[k]; break; }
    }

    const monthMap = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    let monthFilter = null, yearFilter = null;
    for (const [mn,mv] of Object.entries(monthMap)) { if(q.includes(mn)){monthFilter=mv;break;} }
    const yearMatch2 = q.match(/20(2[0-9])/);
    if (yearMatch2) yearFilter = yearMatch2[0];

    if (matchedCat) {
      const { data } = await supabase.from("expenses")
        .select("date,party_name,design_number,amount,sub_group")
        .ilike("sub_group", "%" + matchedCat + "%")
        .order("date", { ascending: false }).limit(500);

      let filtered = data || [];
      if (monthFilter || yearFilter) {
        filtered = filtered.filter(r => {
          const d = (r.date || "").substring(0, 7);
          if (monthFilter && yearFilter) return d === yearFilter + "-" + monthFilter;
          if (monthFilter) return d.endsWith("-" + monthFilter);
          if (yearFilter) return d.startsWith(yearFilter);
          return true;
        });
      }

      if (filtered.length) {
        const tot = filtered.reduce((s,r) => s+(r.amount||0), 0);
        ctx = `${matchedCat} EXPENSES (Rs.${tot.toLocaleString("en-IN")}, ${filtered.length} records):\nDate|Party|Description|Amount\n`;
        filtered.forEach(r => { ctx += `${(r.date||"").split("T")[0]}|${r.party_name||""}|${r.design_number||""}|Rs.${(r.amount||0).toLocaleString("en-IN")}\n`; });
      } else ctx = `No ${matchedCat} expense records found${monthFilter ? " for this period" : ""}.`;
    }
    else if (/month|mahina|monthly|compare|trend/i.test(q)) {
      const { data } = await supabase.from("expenses").select("date,amount,sub_group").limit(2000);
      if (data && data.length) {
        const bm = {};
        data.forEach(r => { const m=(r.date||"").substring(0,7); if(m) bm[m]=(bm[m]||0)+(r.amount||0); });
        ctx = "MONTHLY EXPENSE SUMMARY:\nMonth|Total Amount\n";
        Object.entries(bm).sort().forEach(([m,a]) => { ctx += `${m}|Rs.${a.toLocaleString("en-IN")}\n`; });
        ctx += `GRAND TOTAL: Rs.${data.reduce((s,r)=>s+(r.amount||0),0).toLocaleString("en-IN")}`;
      }
    }
    else {
      const { data } = await supabase.from("expenses").select("sub_group,amount").limit(2000);
      if (data && data.length) {
        const bg = {};
        data.forEach(r => { bg[r.sub_group||"Other"]=(bg[r.sub_group||"Other"]||0)+(r.amount||0); });
        ctx = "EXPENSE SUMMARY BY CATEGORY:\nCategory|Total Amount\n";
        Object.entries(bg).sort((a,b)=>b[1]-a[1]).forEach(([g,a]) => { ctx += `${g}|Rs.${a.toLocaleString("en-IN")}\n`; });
        ctx += `GRAND TOTAL: Rs.${data.reduce((s,r)=>s+(r.amount||0),0).toLocaleString("en-IN")}`;
      }
    }
  }

  // ── INVOICE ──
  else if (type === "INVOICE") {
    const invMatch = question.match(/MIS-[\w-]+/i);
    if (invMatch) {
      const { data } = await supabase.from("sales").select("*").ilike("invoice_no", "%" + invMatch[0] + "%").limit(5);
      if (data && data.length) {
        ctx = "INVOICE DETAILS:\n";
        data.forEach(r => {
          ctx += `Invoice No: ${r.invoice_no}\nCompany: ${r.company_name}\nDescription: ${r.description}\nAmount: Rs.${(r.total_price||0).toLocaleString("en-IN")}\nDate: ${(r.created_at||"").split("T")[0]}\nContact: ${r.contact_person||"N/A"}\nPhone: ${r.phone||"N/A"}\nGST: ${r.gst_no||"N/A"}\nCategory: ${r.category||"N/A"}\nPDF: ${r.invoice_pdf||"Not available"}\n\n`;
        });
      } else ctx = `Invoice ${invMatch[0]} not found.`;
    } else {
      // Fix typos in company name extraction too
      const co = normalizeCompany(fixTypos(question).replace(/invoice|bill|invoices|bills|till\s*date|all|give|show|me|latest|recent/gi, " "));
      if (co.length > 1) {
        const words = co.split(" ").filter(w => w.length > 2);
        const primary = words.sort((a,b) => b.length-a.length)[0];
        if (primary) {
          const { data } = await supabase.from("sales")
            .select("invoice_no,company_name,description,total_price,invoice_pdf,created_at,category,contact_person,phone")
            .ilike("company_name", "%" + primary + "%")
            .order("created_at", { ascending: false }).limit(50);
          if (data && data.length) {
            const tot = data.reduce((s,r) => s+(r.total_price||0), 0);
            ctx = `INVOICES for "${co}" (${data.length} invoices, Total Rs.${tot.toLocaleString("en-IN")}):\nInv No|Date|Description|Category|Amount|PDF\n`;
            data.forEach(r => {
              ctx += `${r.invoice_no||""}|${(r.created_at||"").split("T")[0]}|${(r.description||"").slice(0,50)}|${r.category||""}|Rs.${(r.total_price||0).toLocaleString("en-IN")}|${r.invoice_pdf||"N/A"}\n`;
            });
          } else ctx = `No invoices found for "${co}".`;
        }
      }
    }
  }

  // ── SALES ──
  else if (type === "SALES") {
    const salesCatMap = {
      "erp call system":"ERP - CALL SYSTEM", "erp - call":"ERP - CALL SYSTEM", "erp call":"ERP - CALL SYSTEM",
      "erp ready":"ERP - READY PRODUCTS", "erp product":"ERP - READY PRODUCTS",
      "google sheet retainer":"GOOGLE SHEET - RETAINERSHIP", "retainership":"GOOGLE SHEET - RETAINERSHIP", "retainer":"GOOGLE SHEET - RETAINERSHIP",
      "google sheet custom":"GOOGLE SHEET - CUSTOM", "custom sheet":"GOOGLE SHEET - CUSTOM",
      "google sheet ready":"GOOGLE SHEET - READY", "ready sheet":"GOOGLE SHEET - READY",
      "google sheet amc":"GOOGLE SHEET - AMC", "amc":"GOOGLE SHEET - AMC",
      "whatsapp credit":"WHATSAPP CREDIT", "whatsapp":"WHATSAPP CREDIT", "wa wallet":"WA Wallet",
      "web form":"WEB FORM", "webform":"WEB FORM",
      "mobile app pansari":"MOBILE APP - PANSARI", "mobile app":"MOBILE APP - OTHERS",
      "php pansari":"PHP - PANSARI", "php other":"PHP - OTHERS", "php":"PHP - OTHERS",
      "tally":"TALLY"
    };

    let salesCat = null;
    const sortedSalesCatKeys = Object.keys(salesCatMap).sort((a,b) => b.length-a.length);
    for (const k of sortedSalesCatKeys) {
      if (q.includes(k)) { salesCat = salesCatMap[k]; break; }
    }

    const monthMap = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
    let monthFilter = null, yearFilter = null;
    for (const [mn,mv] of Object.entries(monthMap)) { if(q.includes(mn)){monthFilter=mv;break;} }
    const yearMatch = q.match(/20(2[0-9])/);
    if (yearMatch) yearFilter = yearMatch[0];

    const { data } = await supabase.from("sales")
      .select("company_name,total_price,description,invoice_no,created_at,category")
      .order("created_at", { ascending: false }).limit(5000);

    if (data && data.length) {
      let filtered = data.filter(r => r.total_price > 0);

      if (salesCat) filtered = filtered.filter(r => (r.category||"").toUpperCase() === salesCat.toUpperCase());

      if (monthFilter || yearFilter) {
        filtered = filtered.filter(r => {
          const d = (r.created_at||"").substring(0,7);
          if (monthFilter && yearFilter) return d === yearFilter + "-" + monthFilter;
          if (monthFilter) return d.endsWith("-" + monthFilter);
          if (yearFilter) return d.startsWith(yearFilter);
          return true;
        });
      }

      const topMatch = q.match(/top\s*(\d+)/i);
      const n = topMatch ? parseInt(topMatch[1]) : 10;

      if (/month.?wise|monthly|month.*sale|sale.*month/i.test(q)) {
        const bm = {};
        filtered.forEach(r => { const m=(r.created_at||"").substring(0,7); if(m) bm[m]=(bm[m]||0)+(r.total_price||0); });
        ctx = `MONTH-WISE SALES${salesCat?" ("+salesCat+")":""}:\nMonth|Total Sales\n`;
        Object.entries(bm).sort().forEach(([m,a]) => { ctx += `${m}|Rs.${a.toLocaleString("en-IN")}\n`; });
        ctx += `GRAND TOTAL: Rs.${filtered.reduce((s,r)=>s+(r.total_price||0),0).toLocaleString("en-IN")}`;
      } else if (/categor|category.?wise|by\s*categor|type|breakdow/i.test(q)) {
        const bc = {};
        filtered.forEach(r => { bc[r.category||"Unknown"]=(bc[r.category||"Unknown"]||0)+(r.total_price||0); });
        ctx = "SALES BY CATEGORY:\nCategory|Total Sales\n";
        Object.entries(bc).sort((a,b)=>b[1]-a[1]).forEach(([c,a]) => { ctx += `${c}|Rs.${a.toLocaleString("en-IN")}\n`; });
        ctx += `GRAND TOTAL: Rs.${filtered.reduce((s,r)=>s+(r.total_price||0),0).toLocaleString("en-IN")}`;
      } else {
        const byC = {};
        filtered.forEach(r => { byC[r.company_name||"Unknown"]=(byC[r.company_name||"Unknown"]||0)+(r.total_price||0); });
        const sorted = Object.entries(byC).sort((a,b)=>b[1]-a[1]);
        ctx = `TOP ${n} CLIENTS BY SALES${salesCat?" ("+salesCat+")":""}${monthFilter?" (Month: "+monthFilter+")":""}:\nRank|Company|Total Sales\n`;
        sorted.slice(0,n).forEach(([co,a],i) => { ctx += `${i+1}|${co}|Rs.${a.toLocaleString("en-IN")}\n`; });
        ctx += `TOTAL RECORDS: ${filtered.length}\nGRAND TOTAL: Rs.${filtered.reduce((s,r)=>s+(r.total_price||0),0).toLocaleString("en-IN")}`;
      }
    } else ctx = "No sales records found.";
  }

  // ── CONTACT ──
  else if (type === "CONTACT") {
    const cleaned = normalizeCompany(fixTypos(question)).trim();
    if (cleaned.length < 2) return "Please tell me which company's contact you need.";
    const words = cleaned.split(" ").filter(w => w.length > 2);
    const primary = words.sort((a,b) => b.length-a.length)[0];

    const [{ data: ledgerData }, { data: salesData }] = await Promise.all([
      supabase.from("ledger").select("name,mobile,contact_person,email").ilike("name","%" + primary + "%").limit(5),
      supabase.from("sales").select("company_name,contact_person,phone").ilike("company_name","%" + primary + "%").limit(5)
    ]);

    ctx = "CONTACT INFORMATION:\n";
    const seen = new Set();

    if (ledgerData && ledgerData.length) {
      ledgerData.forEach(r => {
        if (!seen.has(r.name)) {
          seen.add(r.name);
          ctx += `Company: ${r.name}\nContact Person: ${r.contact_person||"N/A"}\nMobile: ${r.mobile||"N/A"}\nEmail: ${r.email||"N/A"}\n\n`;
        }
      });
    }
    if (salesData && salesData.length) {
      salesData.forEach(r => {
        if (!seen.has(r.company_name)) {
          seen.add(r.company_name);
          ctx += `Company: ${r.company_name}\nContact Person: ${r.contact_person||"N/A"}\nPhone: ${r.phone||"N/A"}\n\n`;
        }
      });
    }
    if (seen.size === 0) ctx = `No contact found for "${cleaned}".`;
  }

  // ── GENERAL ──
  else {
    const words = fixTypos(question).split(" ").filter(w => w.length > 3);
    let found = false;
    for (const w of words) {
      const { data } = await supabase.from("ledger")
        .select("name,closing_balance,mobile,contact_person,email")
        .ilike("name","%" + w + "%").limit(5);
      if (data && data.length) {
        ctx = "COMPANY INFO:\n";
        data.forEach(r => { ctx += `Name: ${r.name} | Balance: Rs.${r.closing_balance||0} | Contact: ${r.contact_person||"N/A"} | Mobile: ${r.mobile||"N/A"}\n`; });
        found = true; break;
      }
    }
    if (!found) ctx = "No relevant data found. Please be more specific.";
  }

  return ctx;
}

// ── AI CALLER ─────────────────────────────────────────────────────────────────
async function callAI(systemPrompt, userMessage, history = []) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
        { role: "user", content: userMessage }
      ],
      max_tokens: 2000,
      temperature: 0.1
    })
  });
  const d = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(d));
  return d.choices?.[0]?.message?.content || "No response.";
}

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    const type = detectType(message);

    // ── LEDGER ──
    if (type === "LEDGER") {
      const result = await handleLedger(message, exactName || null);
      if (session_id && result.type !== "suggestions") {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: result.content }
        ]);
      }
      return res.json({ reply: result.content || "", type: result.type, options: result.options || [] });
    }

    // ── CONTACT ──
    if (type === "CONTACT") {
      const ctx = await fetchContext(message, type);
      if (session_id) {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: ctx }
        ]);
      }
      return res.json({ reply: ctx, type: "text" });
    }

    // ── COMBINE EXPENSE ──
    if (type === "COMBINE_EXPENSE") {
      const ctx = await handleCombineExpense(message);
      if (!ctx) {
        // Fallback to regular expense
        return handleAsExpense(message, history, session_id, res);
      }
      const sys = buildSystemPrompt(ctx);
      const reply = await callAI(sys, message, history);
      if (session_id) {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: reply }
        ]);
      }
      const replyType = /<table|<div|<tr|<td|<th/i.test(reply) ? "html" : "text";
      return res.json({ reply, type: replyType });
    }

    // ── NO SALES ──
    if (type === "NO_SALES") {
      const ctx = await handleNoSales(message);
      const sys = buildSystemPrompt(ctx);
      const reply = await callAI(sys, message, history);
      if (session_id) {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: reply }
        ]);
      }
      const replyType = /<table|<div|<tr|<td|<th/i.test(reply) ? "html" : "text";
      return res.json({ reply, type: replyType });
    }

    // ── ALL OTHERS ──
    const ctx = await fetchContext(message, type);
    const sys = buildSystemPrompt(ctx);
    const reply = await callAI(sys, message, history);

    if (session_id) {
      await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: reply }
      ]);
    }

    const replyType = /<table|<div|<tr|<td|<th/i.test(reply) ? "html" : "text";
    res.json({ reply, type: replyType });

  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── SYSTEM PROMPT BUILDER ─────────────────────────────────────────────────────
function buildSystemPrompt(ctx) {
  return `You are a Sales & Finance Assistant for Mis Work India Private Limited.

LANGUAGE: Always reply in ENGLISH ONLY. You understand Hindi, Hinglish, typos, and short forms.
Examples of queries you should handle:
- "erp call system ka sale batao apr 2026 mein" → ERP - CALL SYSTEM sales in April 2026
- "month wise sale dikhao" → Month-wise sales breakdown
- "60-90 days ka pending batao" → Pending with overdue 60-90 days
- "salary + office rent + travel combine karke total kya banta hai" → Sum of those 3 expense categories
- "top 5 clients jinhe is saal invoice nahi gaya but last year the" → Clients invoiced last year but not this year
- "pansri ka lgdr dikao" → Ledger of Pansari company (typo-tolerant)

DATA DISPLAY: Use HTML tables for all data.
Table style: <table border='1' cellpadding='6' style='border-collapse:collapse;width:100%;font-size:12px;font-family:Arial'>

AVAILABLE SALES CATEGORIES:
ERP - CALL SYSTEM | ERP - READY PRODUCTS | GOOGLE SHEET - RETAINERSHIP | GOOGLE SHEET - CUSTOM | GOOGLE SHEET - READY | GOOGLE SHEET - AMC | WHATSAPP CREDIT | WA Wallet | WEB FORM | MOBILE APP - PANSARI | MOBILE APP - OTHERS | PHP - PANSARI | PHP - OTHERS | TALLY

AVAILABLE EXPENSE CATEGORIES:
Salary | OFFICE RENT | Phone and Internet | Technical Exp | Travel Exp | Utility Direc | INSURANCE | Repair & Maintenance | BRANDING EXP | COMMISSION EXP | Stationery | Legal & Prof Exp | Employees Welfare | Financial Exp | Computer Maintenance | Bad Debts | Factory Related | OFFICE EXP | Telephone Exp | Indirect Expenses

RULES:
- NEVER invent data. Use ONLY the DATABASE DATA provided below.
- If no data available: reply "No data found for this query."
- Always show totals/grand totals at the bottom of tables.
- Format all amounts as Rs. X,XX,XXX.XX (Indian format).
- For PDFs, make them clickable links if URL is available.
- For combined expense queries, show each category as a separate row, then grand total row.

DATABASE DATA:
${ctx}`;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MIS Chatbot running at http://localhost:" + PORT));