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

app.post("/history", async (req, res) => {
  try {
    await supabase.from("chat_history").insert({ session_id: req.body.session_id, role: req.body.role, content: req.body.content });
  } catch(e) {}
  res.json({ ok: true });
});

app.delete("/history/:sid", async (req, res) => {
  try {
    await supabase.from("chat_history").delete().eq("session_id", req.params.sid);
  } catch(e) {}
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

function amt(n) {
  const num = parseFloat(n) || 0;
  if (!num) return "";
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeCompany(text = "") {
  return text
    .toLowerCase()
    .replace(/private\s+limited/gi, "")
    .replace(/pvt\.?\s*ltd\.?/gi, "")
    .replace(/\blimited\b|\bltd\b|\bllp\b/gi, "")
    .replace(/\bledger\b|\bkhata\b|\bstatement\b|\bbalance\b|\baccount\b/gi, "")
    .replace(/\bshow\b|\bsend\b|\bplease\b|\bmujhe\b|\bdikhao\b|\bbatao\b|\bbhejo\b|\bdikha\b|\bkaro\b|\bdedo\b|\bde\b|\bdo\b|\bof\b|\bfor\b|\bthe\b|\bka\b|\bki\b|\bke\b/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// FIX 2: Better query detection — handles Hinglish, typos, short forms
function detectType(q) {
  const ql = q.toLowerCase();

  // Ledger
  if (/ledger|khata|statement|account\s+detail|balanc/i.test(ql)) return "LEDGER";

  // Pending / overdue
  if (/pending|overdue|baaki|baki|due|60.?day|90.?day|120.?day|30.?day|180.?day|60-90|90-120|ageing|aging/i.test(ql)) return "PENDING";

  // Salary
  if (/salary|salari|wages|tankhwa|pay\s*roll/i.test(ql)) return "SALARY";

  // Rent
  if (/rent|kiraya|lease/i.test(ql)) return "RENT";

  // Invoice
  if (/invoice|bill|invois|invioce|MIS-/i.test(ql)) return "INVOICE";

  // Expense
  if (/expense|kharcha|kharch|expenditure|cost|spent|payment|paid|spend/i.test(ql)) return "EXPENSE";

  // Sales
  if (/sale|revenue|top\s*\d|client|customer|best|highest|earning|income|sells/i.test(ql)) return "SALES";

  // Phone/contact
  if (/phone|mobile|number|contact|num|no\.|call/i.test(ql)) return "CONTACT";

  return "GENERAL";
}

// ── LEDGER HTML BUILDER ───────────────────────────────────────────────────────
function buildLedgerHTML(info, txns) {
  const openBal = parseFloat(info.opening_balance) || 0;
  const closeBal = parseFloat(info.closing_balance) || 0;

  const dates = txns.map(r => r.voucher_date).filter(Boolean).sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
  const lastDate  = dates[dates.length - 1] ? fmtDate(dates[dates.length - 1]) : firstDate;

  const totalDr = txns.reduce((s, r) => s + (parseFloat(r.voucher_debit) || 0), 0);
  const totalCr = txns.reduce((s, r) => s + (parseFloat(r.voucher_credit) || 0), 0);

  const TD = `padding:5px 8px;border:1px solid #999;font-size:12px;font-family:Arial,sans-serif`;
  const TH = `padding:6px 8px;border:1px solid #555;font-size:12px;font-family:Arial,sans-serif;font-weight:bold;background:#222;color:#fff`;

  let rows = `<tr>
    <td style="${TD};white-space:nowrap"><b>1-Apr-25</b></td>
    <td style="${TD}"><b>To</b></td>
    <td style="${TD}" colspan="3"><b>Opening Balance</b></td>
    <td style="${TD};text-align:right"><b>${openBal > 0 ? amt(openBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${openBal < 0 ? amt(Math.abs(openBal)) : ""}</b></td>
  </tr>`;

  txns.forEach(r => {
    const isDr = (parseFloat(r.voucher_debit) || 0) > 0;
    rows += `<tr>
      <td style="${TD};white-space:nowrap">${fmtDate(r.voucher_date)}</td>
      <td style="${TD}">${isDr ? "To" : "By"}</td>
      <td style="${TD}">${r.voucher_particular || ""}</td>
      <td style="${TD}">${r.voucher_type || ""}</td>
      <td style="${TD};font-family:monospace">${r.voucher_no || ""}</td>
      <td style="${TD};text-align:right">${isDr ? amt(r.voucher_debit) : ""}</td>
      <td style="${TD};text-align:right">${!isDr ? amt(r.voucher_credit) : ""}</td>
    </tr>`;
  });

  const grandDr = totalDr + (openBal > 0 ? openBal : 0);
  const grandCr = totalCr + (openBal < 0 ? Math.abs(openBal) : 0) + Math.abs(closeBal);

  rows += `<tr style="background:#f2f2f2">
    <td style="${TD}" colspan="5"><b>Closing Balance</b></td>
    <td style="${TD};text-align:right"><b>${closeBal > 0 ? amt(closeBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${closeBal < 0 ? amt(Math.abs(closeBal)) : ""}</b></td>
  </tr>
  <tr style="background:#e0e0e0">
    <td style="${TD}" colspan="5"><b>Total</b></td>
    <td style="${TD};text-align:right"><b>${amt(grandDr)}</b></td>
    <td style="${TD};text-align:right"><b>${amt(grandCr)}</b></td>
  </tr>`;

  return `<div style="font-family:Arial,sans-serif;font-size:12px;max-width:900px">
    <div style="text-align:center;padding:10px 4px 4px;border-bottom:2px solid #333">
      <div style="font-size:14px;font-weight:bold">Mis Work India Private Limited</div>
      <div style="font-size:11px;margin-top:3px">7th Floor, Unit No-775, Plot No E4, Aggarwal Millenium Tower 2</div>
      <div style="font-size:11px">Netaji Subhash Place, New Delhi - 110034</div>
    </div>
    <div style="text-align:center;padding:8px 4px 4px;border-bottom:1px solid #999">
      <div style="font-size:13px;font-weight:bold">${info.name}</div>
      <div style="font-size:11px;margin-top:2px">Ledger Account</div>
      <div style="font-size:11px">${firstDate} to ${lastDate}</div>
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
      <span>Net Balance: <b>Rs. ${amt(Math.abs(closeBal)) || "0.00"} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}</b></span>
    </div>
  </div>`;
}

// ── LEDGER HANDLER ────────────────────────────────────────────────────────────
async function handleLedger(question, exactName) {
  if (exactName) {
    const { data } = await supabase.from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .eq("name", exactName)
      .order("voucher_date", { ascending: true })
      .limit(500);
    if (!data || !data.length) return { type: "text", content: "No ledger records found for " + exactName };
    const info = data[0];
    const txns = data.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
    return { type: "html", content: buildLedgerHTML(info, txns) };
  }

  const searchTerm = normalizeCompany(question);
  if (!searchTerm || searchTerm.length < 2) return { type: "text", content: "Please tell me the company name." };

  const searchWords = searchTerm.split(" ").filter(w => w.length > 2);
  if (!searchWords.length) return { type: "text", content: "Please tell me the company name." };

  const primaryWord = searchWords.sort((a, b) => b.length - a.length)[0];

  const { data } = await supabase.from("ledger")
    .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
    .ilike("name", "%" + primaryWord + "%")
    .order("voucher_date", { ascending: true })
    .limit(2000);

  if (!data || !data.length) return { type: "text", content: "No company found matching '" + searchTerm + "'. Please check the company name." };

  const matchedRows = data.filter(row => {
    const dbNorm = normalizeCompany(row.name || "");
    return searchWords.every(word => dbNorm.includes(word));
  });

  if (!matchedRows.length) {
    const suggestions = [...new Set(data.map(r => r.name))].slice(0, 6);
    if (suggestions.length > 0) return { type: "suggestions", content: "Company not found. Did you mean:", options: suggestions };
    return { type: "text", content: "No company found for '" + searchTerm + "'." };
  }

  const uniqueNames = [...new Set(matchedRows.map(r => r.name))];
  if (uniqueNames.length > 1) return { type: "suggestions", content: "Multiple companies found. Which one?", options: uniqueNames.slice(0, 8) };

  const companyRows = matchedRows.filter(r => r.name === uniqueNames[0]);
  const info = companyRows[0];
  const txns = companyRows.filter(r => r.voucher_particular && !["Opening Balance","Closing Balance",""].includes(r.voucher_particular));
  return { type: "html", content: buildLedgerHTML(info, txns) };
}

// ── CONTACT HANDLER ───────────────────────────────────────────────────────────
async function handleContact(question) {
  const cleaned = normalizeCompany(question
    .replace(/phone|mobile|number|contact|num|no\.|call|give|me|please|ka|ki|ke|de|do|batao|dikhao/gi, " ")
  ).trim();

  if (!cleaned || cleaned.length < 2) return "Please tell me which company's contact you need.";

  const words = cleaned.split(" ").filter(w => w.length > 2);
  const primaryWord = words.sort((a,b) => b.length - a.length)[0];

  const { data } = await supabase.from("ledger")
    .select("name,mobile,contact_person,email")
    .ilike("name", "%" + primaryWord + "%")
    .limit(10);

  if (!data || !data.length) return "No contact found for '" + cleaned + "'.";

  let result = "Contact Details:\n\n";
  const seen = new Set();
  data.forEach(r => {
    if (!seen.has(r.name)) {
      seen.add(r.name);
      result += `Company: ${r.name}\nContact: ${r.contact_person || "N/A"}\nMobile: ${r.mobile || "N/A"}\nEmail: ${r.email || "N/A"}\n\n`;
    }
  });
  return result.trim();
}

// ── CONTEXT FETCHER ───────────────────────────────────────────────────────────
async function fetchContext(question, type) {
  const q = question.toLowerCase();
  let ctx = "";

  if (type === "PENDING") {
    const { data: allPending } = await supabase.from("pending")
      .select("party_name,bill_ref_no,pending_amount,due_date,overdue_days,party_group")
      .order("overdue_days", { ascending: false })
      .limit(1000);

    if (allPending && allPending.length) {
      let filtered = allPending;

      // Handle ranges like 60-90, 90-120, 120+
      if (/120\s*\+|above\s*120|more\s*than\s*120/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 120);
      else if (/90.?120/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 90 && r.overdue_days < 120);
      else if (/60.?90/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 60 && r.overdue_days < 90);
      else if (/30.?60/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 30 && r.overdue_days < 60);
      else if (/180/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 180);
      else if (/120/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 120);
      else if (/90/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 90);
      else if (/60/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 60);
      else if (/30/i.test(q)) filtered = allPending.filter(r => r.overdue_days >= 30);

      const tot = filtered.reduce((s, r) => s + parseFloat(r.pending_amount || 0), 0);
      ctx = "PENDING (" + filtered.length + " records, Total Rs." + tot.toLocaleString("en-IN") + "):\n";
      ctx += "Party|BillRef|Amount|Overdue Days|Type\n";
      filtered.forEach(r => {
        ctx += (r.party_name||"") + "|" + (r.bill_ref_no||"") + "|Rs." + parseFloat(r.pending_amount||0).toLocaleString("en-IN") + "|" + (r.overdue_days||0) + " days|" + (r.party_group||"") + "\n";
      });
    } else ctx = "No pending records found.";
  }

  else if (type === "SALARY") {
    const { data } = await supabase.from("expenses")
      .select("date,party_name,design_number,amount,sub_group")
      .ilike("sub_group", "%salary%")
      .order("date", { ascending: false })
      .limit(300);

    if (data && data.length) {
      const byP = {};
      data.forEach(r => { const k = r.party_name || r.design_number || "Unknown"; byP[k] = (byP[k]||0) + (r.amount||0); });
      const tot = data.reduce((s,r) => s+(r.amount||0), 0);
      ctx = "SALARY DATA (Total Rs." + tot.toLocaleString("en-IN") + "):\nEmployee|Total Paid\n";
      Object.entries(byP).sort((a,b) => b[1]-a[1]).forEach(([n,a]) => { ctx += n + "|Rs." + a.toLocaleString("en-IN") + "\n"; });
    } else ctx = "No salary records found.";
  }

  else if (type === "RENT") {
    const { data } = await supabase.from("expenses")
      .select("date,party_name,design_number,amount")
      .ilike("sub_group", "%rent%")
      .order("date", { ascending: false })
      .limit(100);

    if (data && data.length) {
      const tot = data.reduce((s,r) => s+(r.amount||0), 0);
      ctx = "RENT DATA (Total Rs." + tot.toLocaleString("en-IN") + "):\nDate|Party|Description|Amount\n";
      data.forEach(r => { ctx += (r.date||"").split("T")[0] + "|" + (r.party_name||"") + "|" + (r.design_number||"") + "|Rs." + (r.amount||0).toLocaleString("en-IN") + "\n"; });
    } else ctx = "No rent records found.";
  }

  else if (type === "INVOICE") {
    const inv = question.match(/MIS-[\w-]+/i);
    if (inv) {
      const { data } = await supabase.from("sales").select("*").ilike("invoice_no", "%" + inv[0] + "%").limit(3);
      if (data && data.length) {
        const r = data[0];
        ctx = "INVOICE DETAILS:\nInvoice No: " + r.invoice_no + "\nCompany: " + r.company_name + "\nDescription: " + r.description + "\nAmount: Rs." + (r.total_price||0).toLocaleString("en-IN") + "\nDate: " + (r.created_at||"").split("T")[0] + "\nContact: " + (r.contact_person||"N/A") + "\nGST: " + (r.gst_no||"N/A") + "\nPDF: " + (r.invoice_pdf||"Not available");
      } else ctx = "Invoice " + inv[0] + " not found.";
    } else {
      const co = question.replace(/give\s*me|show\s*me|invoice|invoices|bill|bills|last|latest|recent|of|for|send|please|ka|ki|ke|bhejo|dikhao|mujhe|get|fetch|find|the/gi, " ").replace(/\s+/g, " ").trim();
      if (co.length > 1) {
        const { data } = await supabase.from("sales")
          .select("invoice_no,company_name,description,total_price,invoice_pdf,created_at")
          .ilike("company_name", "%" + co + "%")
          .order("created_at", { ascending: false })
          .limit(20);
        if (data && data.length) {
          const tot = data.reduce((s,r) => s+(r.total_price||0), 0);
          ctx = "INVOICES for " + co + " (" + data.length + " invoices, Total Rs." + tot.toLocaleString("en-IN") + "):\nInv No|Date|Description|Amount|PDF\n";
          data.forEach(r => { ctx += (r.invoice_no||"") + "|" + (r.created_at||"").split("T")[0] + "|" + (r.description||"").slice(0,40) + "|Rs." + (r.total_price||0).toLocaleString("en-IN") + "|" + (r.invoice_pdf||"N/A") + "\n"; });
        } else ctx = "No invoices found for '" + co + "'.";
      }
    }
  }

  else if (type === "EXPENSE") {
    const catMap = {
      "phone":"Phone and Internet","mobile":"Phone and Internet","internet":"Phone and Internet",
      "travel":"Travel Exp","conveyance":"Travel Exp","petrol":"Travel Exp",
      "electricity":"Utility Direc","bijli":"Utility Direc","utility":"Utility Direc",
      "insurance":"INSURANCE",
      "maintenance":"Repair & Maintenance","repair":"Repair & Maintenance",
      "branding":"BRANDING EXP","marketing":"BRANDING EXP","advertis":"BRANDING EXP",
      "commission":"COMMISSION EXP",
      "stationery":"Stationery","stationary":"Stationery"
    };

    let cat = null;
    for (const [k,v] of Object.entries(catMap)) { if(q.includes(k)){cat=v;break;} }

    if (cat) {
      const { data } = await supabase.from("expenses").select("date,party_name,amount").ilike("sub_group","%" + cat + "%").limit(200);
      if (data && data.length) {
        const tot = data.reduce((s,r)=>s+(r.amount||0),0);
        ctx = cat + " EXPENSES (Rs." + tot.toLocaleString("en-IN") + ", " + data.length + " records):\nDate|Party|Amount\n";
        data.forEach(r=>{ctx+=(r.date||"").split("T")[0]+"|"+(r.party_name||"")+"|Rs."+(r.amount||0).toLocaleString("en-IN")+"\n";});
      }
    } else if (/monthly|month|mahina|compare|comparison|trend/i.test(q)) {
      const { data } = await supabase.from("expenses").select("date,amount").limit(2000);
      if (data && data.length) {
        const bm = {};
        data.forEach(r=>{const m=(r.date||"").substring(0,7);if(m)bm[m]=(bm[m]||0)+(r.amount||0);});
        ctx = "MONTHLY EXPENSE BREAKDOWN:\nMonth|Total\n";
        Object.entries(bm).sort().forEach(([m,a])=>{ctx+=m+"|Rs."+a.toLocaleString("en-IN")+"\n";});
        ctx += "GRAND TOTAL: Rs." + data.reduce((s,r)=>s+(r.amount||0),0).toLocaleString("en-IN");
      }
    } else {
      // Default: category-wise summary
      const { data } = await supabase.from("expenses").select("sub_group,amount").limit(2000);
      if (data && data.length) {
        const bg = {};
        data.forEach(r=>{bg[r.sub_group||"Other"]=(bg[r.sub_group||"Other"]||0)+(r.amount||0);});
        ctx = "EXPENSE SUMMARY BY CATEGORY:\nCategory|Total\n";
        Object.entries(bg).sort((a,b)=>b[1]-a[1]).forEach(([g,a])=>{ctx+=g+"|Rs."+a.toLocaleString("en-IN")+"\n";});
        ctx += "GRAND TOTAL: Rs." + data.reduce((s,r)=>s+(r.amount||0),0).toLocaleString("en-IN");
      }
    }
  }

  else if (type === "SALES") {
    const { data: salesData } = await supabase.from("sales")
      .select("company_name,total_price,description,invoice_no,created_at")
      .order("total_price", { ascending: false })
      .limit(1000);

    if (salesData && salesData.length) {
      // Check if asking about specific category/description
      const descKeywords = ["erp","software","hardware","cloud","it","service","product","system"];
      let descFilter = null;
      for (const kw of descKeywords) {
        if (q.includes(kw)) { descFilter = kw; break; }
      }

      let filtered = salesData;
      if (descFilter) filtered = salesData.filter(r => (r.description||"").toLowerCase().includes(descFilter));

      // Month filter
      const monthMap = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };
      let monthFilter = null, yearFilter = null;
      for (const [mn,mv] of Object.entries(monthMap)) { if(q.includes(mn)){monthFilter=mv;break;} }
      const yearMatch = q.match(/20(2[0-9])/);
      if (yearMatch) yearFilter = yearMatch[0];

      if (monthFilter || yearFilter) {
        filtered = filtered.filter(r => {
          const d = (r.created_at||"").substring(0,7);
          if (monthFilter && yearFilter) return d === yearFilter + "-" + monthFilter;
          if (monthFilter) return d.endsWith("-" + monthFilter);
          if (yearFilter) return d.startsWith(yearFilter);
          return true;
        });
      }

      const byCompany = {};
      filtered.forEach(r => { const co=r.company_name||"Unknown"; byCompany[co]=(byCompany[co]||0)+(r.total_price||0); });
      const sorted = Object.entries(byCompany).sort((a,b)=>b[1]-a[1]);
      const topMatch = q.match(/top\s*(\d+)/i);
      const n = topMatch ? parseInt(topMatch[1]) : 10;

      ctx = "TOP " + n + " CLIENTS BY SALES" + (descFilter ? " ("+descFilter+" category)" : "") + ":\nRank|Company|Total Sales\n";
      sorted.slice(0,n).forEach(([co,a],i) => { ctx += (i+1)+"|"+co+"|Rs."+a.toLocaleString("en-IN")+"\n"; });
      ctx += "TOTAL RECORDS: " + filtered.length + "\nGRAND TOTAL: Rs." + filtered.reduce((s,r)=>s+(r.total_price||0),0).toLocaleString("en-IN");
    } else ctx = "No sales records found.";
  }

  else {
    // General — try to find company info
    const words = question.split(" ").filter(w => w.length > 3);
    let found = false;
    for (const w of words) {
      const { data } = await supabase.from("ledger")
        .select("name,closing_balance,mobile,contact_person,email")
        .ilike("name","%" + w + "%")
        .limit(5);
      if (data && data.length) {
        ctx = "COMPANY INFO:\n";
        data.forEach(r => { ctx += "Name: "+r.name+" | Balance: Rs."+(r.closing_balance||0)+" | Contact: "+(r.contact_person||"N/A")+" | Mobile: "+(r.mobile||"N/A")+" | Email: "+(r.email||"N/A")+"\n"; });
        found = true;
        break;
      }
    }
    if (!found) ctx = "No relevant data found. Please be more specific about what you are looking for.";
  }

  return ctx;
}

// ── MAIN CHAT ROUTE ───────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    const type = detectType(message);

    // CONTACT: Direct from DB, no AI needed
    if (type === "CONTACT") {
      const reply = await handleContact(message);
      if (session_id) {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: reply }
        ]);
      }
      return res.json({ reply, type: "text" });
    }

    // LEDGER: Direct HTML, no AI
    if (type === "LEDGER") {
      const result = await handleLedger(message, exactName || null);
      if (session_id && result.type !== "suggestions") {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: result.content }
        ]);
      }
      return res.json({
        reply: result.content || "",
        type: result.type,
        options: result.options || []
      });
    }

    // ALL OTHERS: OpenAI GPT-4o-mini
    const ctx = await fetchContext(message, type);

    const sys = `You are a Sales & Finance Assistant for Mis Work India Private Limited.

LANGUAGE RULES:
- ALWAYS reply in ENGLISH ONLY — even if user writes in Hindi, Hinglish, or broken English.
- Understand queries written in Hinglish (mix of Hindi and English), typos, and short forms.
- Examples: "kitna hua sale last month" = "What was the total sale last month", "pansaro ka number do" = "Give me Pansari's contact number", "top 10 client batao" = "Show top 10 clients by sales".

DATA DISPLAY RULES:
- Use HTML tables for ALL data with more than 2 rows.
- Table style: <table border='1' cellpadding='6' style='border-collapse:collapse;width:100%;font-size:12px;font-family:Arial'>
- Always show GRAND TOTAL / SUMMARY row at the bottom of tables.
- Format all amounts in Indian format: Rs. X,XX,XXX.XX

TABLE FORMATS BY TYPE:
- PENDING: Party Name | Bill Ref | Pending Amount | Overdue Days | Type — highlight high overdue in red
- SALARY: Employee | Total Paid — Grand total at bottom
- INVOICE: Invoice No | Date | Description | Amount | PDF Link (make PDF clickable if URL available)
- EXPENSE: Category | Total Amount — Grand total at bottom
- SALES: Rank | Company | Total Sales — Grand total at bottom
- CONTACT: Show as plain text with Name, Contact Person, Mobile, Email

STRICT RULES:
- NEVER invent, guess, or assume any data.
- Use ONLY the data provided in DATABASE DATA section below.
- If data is empty or not found: reply "No data found for this query. Please check the details and try again."
- If user asks about something not in the data, say so clearly.

DATABASE DATA:
${ctx}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
          { role: "user", content: message }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    const d = await response.json();
    if (!response.ok) return res.status(500).json({ error: "AI error", details: d });

    const reply = d.choices?.[0]?.message?.content || "No response.";

    // FIX 3: Save to chat history properly
    if (session_id) {
      await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: reply }
      ]);
    }

    const replyType = /<table|<div|<tr|<td|<th/i.test(reply) ? "html" : "text";
    res.json({ reply, type: replyType });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MIS Chatbot running at http://localhost:" + PORT));