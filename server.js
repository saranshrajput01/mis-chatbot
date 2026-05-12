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
  const { data } = await supabase.from("chat_history").select("role,content,created_at").eq("session_id", req.params.sid).order("created_at", { ascending: true }).limit(50);
  res.json(data || []);
});
app.post("/history", async (req, res) => {
  await supabase.from("chat_history").insert({ session_id: req.body.session_id, role: req.body.role, content: req.body.content });
  res.json({ ok: true });
});
app.delete("/history/:sid", async (req, res) => {
  await supabase.from("chat_history").delete().eq("session_id", req.params.sid);
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
  const num = parseFloat(n);
  if (!num || isNaN(num) || num === 0) return "";
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// FIX 1: normalizeCompany — strips all noise words for matching
function normalizeCompany(text = "") {
  return text
    .toLowerCase()
    .replace(/private\s+limited/gi, "")
    .replace(/pvt\.?\s*ltd\.?/gi, "")
    .replace(/\blimited\b/gi, "")
    .replace(/\bltd\b/gi, "")
    .replace(/\bledger\b/gi, "")
    .replace(/\bkhata\b/gi, "")
    .replace(/\bstatement\b/gi, "")
    .replace(/\bbalance\b/gi, "")
    .replace(/\baccount\b/gi, "")
    .replace(/\bshow\b/gi, "")
    .replace(/\bsend\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/\bmujhe\b/gi, "")
    .replace(/\bdikhao\b/gi, "")
    .replace(/\bbatao\b/gi, "")
    .replace(/\bbhejo\b/gi, "")
    .replace(/\bdikha\b/gi, "")
    .replace(/\bkaro\b/gi, "")
    .replace(/\bdedo\b/gi, "")
    .replace(/\bde\b/gi, "")
    .replace(/\bdo\b/gi, "")
    .replace(/\bof\b/gi, "")
    .replace(/\bfor\b/gi, "")
    .replace(/\bthe\b/gi, "")
    .replace(/\bka\b/gi, "")
    .replace(/\bki\b/gi, "")
    .replace(/\bke\b/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectType(q) {
  const ql = q.toLowerCase();
  if (ql.includes("ledger") || ql.includes("khata") || ql.includes("statement")) return "LEDGER";
  if (ql.includes("pending") || ql.includes("overdue") || ql.includes("baaki") ||
      ql.includes("60-90") || ql.includes("90-120") ||
      (ql.includes("due") && !ql.includes("invoice")) ||
      (ql.includes("days") && (ql.includes("60") || ql.includes("90") || ql.includes("30") || ql.includes("120")))) return "PENDING";
  if (ql.includes("salary") || ql.includes("salari") || ql.includes("wages")) return "SALARY";
  if (ql.includes("rent") || ql.includes("kiraya")) return "RENT";
  if (ql.includes("invoice") || /mis-\d/i.test(q)) return "INVOICE";
  if (ql.includes("expense") || ql.includes("kharcha") || ql.includes("kharch")) return "EXPENSE";
  if (ql.includes("sale") || ql.includes("sales") || ql.includes("revenue") ||
      ql.includes("client") || ql.includes("customer") || ql.includes("top") ||
      ql.includes("product") || ql.includes("categor") || ql.includes("selling") ||
      ql.includes("bill") || ql.includes("bikri")) return "SALES";
  return "GENERAL";
}

function extractName(q, stopwords) {
  let c = q.toLowerCase();
  stopwords.forEach(w => { c = c.replace(new RegExp("\\b" + w + "\\b", "gi"), " "); });
  return c.replace(/[?।,\.]/g, "").replace(/\s+/g, " ").trim();
}

// ── LEDGER HTML BUILDER — Image 2 format ─────────────────────────────────────
function buildLedgerHTML(info, txns) {
  const openBal = parseFloat(info.opening_balance) || 0;
  const closeBal = parseFloat(info.closing_balance) || 0;

  // Find date range
  const dates = txns.map(r => r.voucher_date).filter(Boolean).sort();
  const firstDate = dates[0] ? fmtDate(dates[0]) : "01-Apr-25";
  const lastDate  = dates[dates.length - 1] ? fmtDate(dates[dates.length - 1]) : firstDate;

  // Totals
  const totalDr = txns.reduce((s, r) => s + (parseFloat(r.voucher_debit) || 0), 0);
  const totalCr = txns.reduce((s, r) => s + (parseFloat(r.voucher_credit) || 0), 0);

  // Amount formatter with comma — no blank for zero
  function amt(n) {
    const num = parseFloat(n) || 0;
    if (!num) return "";
    return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const TD = `padding:5px 8px;border:1px solid #999;font-size:12px;font-family:Arial,sans-serif`;
  const TH = `padding:6px 8px;border:1px solid #555;font-size:12px;font-family:Arial,sans-serif;font-weight:bold;background:#222;color:#fff`;

  // Opening Balance row
  let rows = `<tr>
    <td style="${TD};white-space:nowrap"><b>1-Apr-25</b></td>
    <td style="${TD}"><b>To</b></td>
    <td style="${TD}" colspan="3"><b>Opening Balance</b></td>
    <td style="${TD};text-align:right"><b>${openBal > 0 ? amt(openBal) : ""}</b></td>
    <td style="${TD};text-align:right"><b>${openBal < 0 ? amt(Math.abs(openBal)) : ""}</b></td>
  </tr>`;

  // Transaction rows
  txns.forEach((r) => {
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

  // Closing / totals rows — exactly like Image 2
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

  return `<div style="font-family:Arial,sans-serif;font-size:12px;max-width:900px;margin:0;padding:0">

    <!-- Company Header -->
    <div style="text-align:center;padding:10px 4px 4px;border-bottom:2px solid #333">
      <div style="font-size:14px;font-weight:bold">Mis Work India Private Limited</div>
      <div style="font-size:11px;margin-top:3px">7th Floor, Unit No-775, Part of Unit No-771,Plot, No E4</div>
      <div style="font-size:11px">Aggarwal Millenium Tower 2, Lala Jagat</div>
      <div style="font-size:11px">Narayan Marg, Netaji Subhash Place, New Delhi</div>
      <div style="font-size:11px">North West Delhi, Delhi-110034</div>
    </div>

    <!-- Party Header -->
    <div style="text-align:center;padding:8px 4px 4px;border-bottom:1px solid #999">
      <div style="font-size:13px;font-weight:bold">${info.name}</div>
      ${info.address ? `<div style="font-size:11px;margin-top:2px">${info.address}</div>` : ""}
      <div style="font-size:11px;margin-top:2px">Ledger Account</div>
      <div style="font-size:11px">${firstDate} to ${lastDate}</div>
    </div>

    <!-- Table -->
    <div style="overflow-x:auto;margin-top:0">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr>
          <th style="${TH};text-align:left">Date</th>
          <th style="${TH};text-align:left">&nbsp;</th>
          <th style="${TH};text-align:left">Particulars</th>
          <th style="${TH};text-align:left">Vch Type</th>
          <th style="${TH};text-align:left">Vch No.</th>
          <th style="${TH};text-align:right">Debit</th>
          <th style="${TH};text-align:right">Credit</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    </div>

    <!-- Footer -->
    <div style="padding:4px 8px;font-size:11px;color:#555;display:flex;justify-content:space-between;border-top:1px solid #ccc">
      <span>Total Transactions: <b>${txns.length}</b></span>
      <span>Net Balance: <b>Rs. ${amt(Math.abs(closeBal)) || "0.00"} ${closeBal >= 0 ? "(Dr)" : "(Cr)"}</b></span>
    </div>
  </div>`;
}

// ── FIX 2: LEDGER HANDLER — client-side normalize + word-by-word matching ────
async function handleLedger(question, exactName) {

  // If exactName given (from suggestion click), use it directly — skip normalize
  if (exactName) {
    const { data } = await supabase
      .from("ledger")
      .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
      .eq("name", exactName)
      .order("voucher_date", { ascending: true })
      .limit(500);

    if (!data || !data.length) return { type: "text", content: "No ledger records found for " + exactName };

    const info = data[0];
    const txns = data.filter(r => r.voucher_particular && !["Opening Balance", "Closing Balance", ""].includes(r.voucher_particular));
    return { type: "html", content: buildLedgerHTML(info, txns) };
  }

  // Normalize the search term
  const searchTerm = normalizeCompany(question);

  if (!searchTerm || searchTerm.length < 2) {
    return { type: "text", content: "Please tell me the company name." };
  }

  // Split into meaningful words (>2 chars)
  const searchWords = searchTerm.split(" ").filter(w => w.length > 2);

  if (!searchWords.length) {
    return { type: "text", content: "Please tell me the company name." };
  }

  // FIX: Search using the FIRST significant keyword (most unique word)
  // Then filter client-side using ALL words (AND logic)
  const primaryWord = searchWords.sort((a, b) => b.length - a.length)[0]; // longest word = most unique

  const { data, error } = await supabase
    .from("ledger")
    .select("name,opening_balance,closing_balance,voucher_date,voucher_particular,voucher_type,voucher_no,voucher_debit,voucher_credit")
    .ilike("name", "%" + primaryWord + "%")
    .order("voucher_date", { ascending: true })
    .limit(2000);

  if (error || !data) return { type: "text", content: "Database error while fetching ledger." };

  // Client-side: filter rows where ALL search words are present in normalized name
  const matchedRows = data.filter(row => {
    const dbNorm = normalizeCompany(row.name || "");
    return searchWords.every(word => dbNorm.includes(word));
  });

  if (!matchedRows.length) {
    // Try OR logic for suggestions
    const allMatched = data.filter(row => {
      const dbNorm = normalizeCompany(row.name || "");
      return searchWords.some(word => word.length > 2 && dbNorm.includes(word));
    });
    const suggestions = [...new Set(allMatched.map(r => r.name))].slice(0, 6);

    if (suggestions.length > 0) {
      return { type: "suggestions", content: "Company not found. Did you mean:", options: suggestions };
    }
    return { type: "text", content: `No company found for '${searchTerm}'.` };
  }

  // Multiple companies found?
  const uniqueNames = [...new Set(matchedRows.map(r => r.name))];
  if (uniqueNames.length > 1) {
    return { type: "suggestions", content: "Multiple companies found. Which one?", options: uniqueNames.slice(0, 10) };
  }

  // Single company — show ledger
  const targetName = uniqueNames[0];
  const companyRows = matchedRows.filter(r => r.name === targetName);
  const info = companyRows[0];
  const txns = companyRows.filter(r =>
    r.voucher_particular && !["Opening Balance", "Closing Balance", ""].includes(r.voucher_particular)
  );

  return { type: "html", content: buildLedgerHTML(info, txns) };
}

// ── CONTEXT FETCHER FOR AI QUERIES ───────────────────────────────────────────
async function fetchContext(question, type) {
  const q = question.toLowerCase();
  let ctx = "";

  if (type === "PENDING") {
    // Fetch ALL pending data first, then bucket client-side for range queries
    const { data: allPending } = await supabase.from("pending")
      .select("party_name,bill_ref_no,pending_amount,due_date,overdue_days,party_group")
      .order("overdue_days", { ascending: false })
      .limit(500);

    if (allPending && allPending.length) {
      let filtered = allPending;

      // Day range buckets — detect from question
      const is6090   = q.includes("60-90")  || (q.includes("60") && q.includes("90"));
      const is90120  = q.includes("90-120") || (q.includes("90") && q.includes("120"));
      const is120plus = q.includes("120+")  || q.includes("120 days") || (q.includes("120") && (q.includes("above") || q.includes("more") || q.includes("plus") || q.includes("upar")));

      if (is6090)        filtered = allPending.filter(r => r.overdue_days >= 60 && r.overdue_days < 90);
      else if (is90120)  filtered = allPending.filter(r => r.overdue_days >= 90 && r.overdue_days < 120);
      else if (is120plus) filtered = allPending.filter(r => r.overdue_days >= 120);
      else if (q.includes("180")) filtered = allPending.filter(r => r.overdue_days >= 180);
      else if (q.includes("90"))  filtered = allPending.filter(r => r.overdue_days >= 90);
      else if (q.includes("60"))  filtered = allPending.filter(r => r.overdue_days >= 60);
      else if (q.includes("30"))  filtered = allPending.filter(r => r.overdue_days >= 30);

      // If query asks for ALL buckets (60-90 AND 90-120 AND 120+)
      const wantsAll = (q.includes("60-90") || q.includes("90-120") || q.includes("120")) &&
                        q.includes("and");

      if (wantsAll) {
        const b6090  = allPending.filter(r => r.overdue_days >= 60 && r.overdue_days < 90);
        const b90120 = allPending.filter(r => r.overdue_days >= 90 && r.overdue_days < 120);
        const b120p  = allPending.filter(r => r.overdue_days >= 120);
        const tot6090  = b6090.reduce((s,r)=>s+parseFloat(r.pending_amount||0),0);
        const tot90120 = b90120.reduce((s,r)=>s+parseFloat(r.pending_amount||0),0);
        const tot120p  = b120p.reduce((s,r)=>s+parseFloat(r.pending_amount||0),0);
        ctx  = "PENDING BUCKETS SUMMARY:\nBucket|Count|Total Amount\n";
        ctx += "60-90 days|" + b6090.length + "|Rs." + tot6090.toLocaleString("en-IN") + "\n";
        ctx += "90-120 days|" + b90120.length + "|Rs." + tot90120.toLocaleString("en-IN") + "\n";
        ctx += "120+ days|" + b120p.length + "|Rs." + tot120p.toLocaleString("en-IN") + "\n";
        ctx += "\nDETAIL - 60-90 days (" + b6090.length + " records):\nParty|BillRef|Amount|Days\n";
        b6090.forEach(r => { ctx += (r.party_name||"") + "|" + (r.bill_ref_no||"") + "|" + (r.pending_amount||"") + "|" + (r.overdue_days||0) + "\n"; });
        ctx += "\nDETAIL - 90-120 days (" + b90120.length + " records):\nParty|BillRef|Amount|Days\n";
        b90120.forEach(r => { ctx += (r.party_name||"") + "|" + (r.bill_ref_no||"") + "|" + (r.pending_amount||"") + "|" + (r.overdue_days||0) + "\n"; });
        ctx += "\nDETAIL - 120+ days (" + b120p.length + " records):\nParty|BillRef|Amount|Days\n";
        b120p.forEach(r => { ctx += (r.party_name||"") + "|" + (r.bill_ref_no||"") + "|" + (r.pending_amount||"") + "|" + (r.overdue_days||0) + "\n"; });
      } else {
        const tot = filtered.reduce((s,r)=>s+parseFloat(r.pending_amount||0),0);
        ctx = "PENDING (" + filtered.length + " records, Total Rs." + tot.toLocaleString("en-IN") + "):\nParty|BillRef|Amount|Days|Type\n";
        filtered.forEach(r => { ctx += (r.party_name||"") + "|" + (r.bill_ref_no||"") + "|" + (r.pending_amount||"") + "|" + (r.overdue_days||0) + "|" + (r.party_group||"") + "\n"; });
      }
    } else ctx = "No pending records found.";
  }

  // FIX 3: SALARY — use ilike instead of eq to handle case/spacing issues
  else if (type === "SALARY") {
    const person = extractName(q, ["salary","salari","ki","ka","ke","kitni","kitna","total","show","the","mujhe","expense","expenses"]);
    let qry = supabase.from("expenses").select("date,party_name,design_number,amount,sub_group")
      .ilike("sub_group", "%salary%")   // FIX: was .eq("sub_group","Salary") — case sensitive & exact
      .order("date", { ascending: false });
    if (person && person.length > 2) qry = qry.ilike("party_name", "%" + person + "%");
    const { data } = await qry.limit(300);
    if (data && data.length) {
      const byP = {};
      data.forEach(r => {
        const key = r.party_name || r.design_number || "Unknown";
        byP[key] = (byP[key] || 0) + (r.amount || 0);
      });
      const tot = data.reduce((s, r) => s + (r.amount || 0), 0);
      ctx = "SALARY (Total Rs." + tot.toLocaleString("en-IN") + "):\nEmployee|Total\n";
      Object.entries(byP).sort((a, b) => b[1] - a[1]).forEach(([n, a]) => { ctx += n + "|Rs." + a.toLocaleString("en-IN") + "\n"; });
    } else {
      // FIX: Also try grp column as fallback
      const { data: d2 } = await supabase.from("expenses").select("date,party_name,design_number,amount,grp")
        .ilike("grp", "%salary%")
        .order("date", { ascending: false })
        .limit(300);
      if (d2 && d2.length) {
        const byP = {};
        d2.forEach(r => {
          const key = r.party_name || r.design_number || "Unknown";
          byP[key] = (byP[key] || 0) + (r.amount || 0);
        });
        const tot = d2.reduce((s, r) => s + (r.amount || 0), 0);
        ctx = "SALARY (Total Rs." + tot.toLocaleString("en-IN") + "):\nEmployee|Total\n";
        Object.entries(byP).sort((a, b) => b[1] - a[1]).forEach(([n, a]) => { ctx += n + "|Rs." + a.toLocaleString("en-IN") + "\n"; });
      } else ctx = "No salary records found.";
    }
  }

  else if (type === "RENT") {
    const { data } = await supabase.from("expenses").select("date,party_name,design_number,amount")
      .ilike("sub_group", "%rent%")   // FIX: ilike instead of exact string
      .order("date", { ascending: false }).limit(100);
    if (data && data.length) {
      const tot = data.reduce((s, r) => s + (r.amount || 0), 0);
      ctx = "RENT (Total Rs." + tot.toLocaleString("en-IN") + ", " + data.length + " records):\nDate|Party|Desc|Amount\n";
      data.forEach(r => { ctx += (r.date || "").split("T")[0] + "|" + (r.party_name || "") + "|" + (r.design_number || "") + "|Rs." + (r.amount || 0) + "\n"; });
    } else ctx = "No rent records.";
  }

  else if (type === "INVOICE") {
    const inv = question.match(/MIS-[\w-]+/i);
    if (inv) {
      const { data } = await supabase.from("sales").select("*").ilike("invoice_no", "%" + inv[0] + "%").limit(3);
      if (data && data.length) {
        const r = data[0];
        ctx = "INVOICE:\nNo:" + r.invoice_no + "\nCompany:" + r.company_name + "\nDesc:" + r.description + "\nAmount:Rs." + (r.total_price || 0).toLocaleString("en-IN") + "\nDate:" + (r.created_at || "").split("T")[0] + "\nContact:" + (r.contact_person || "N/A") + "\nGST:" + (r.gst_no || "N/A") + "\nPDF:" + (r.invoice_pdf || "Not available");
      } else ctx = "Invoice " + inv[0] + " not found.";
    } else {
      // Clean company name from query
      const co = question
        .replace(/give me|show me|invoice|invoices|bill|bills|last|latest|recent|of|for|send|please|ka|ki|ke|bhejo|dikhao|mujhe|get|fetch|find/gi, " ")
        .replace(/\s+/g, " ").trim();

      if (co.length > 1) {
        // Try exact phrase first
        const { data } = await supabase.from("sales")
          .select("invoice_no,company_name,description,total_price,invoice_pdf,created_at")
          .ilike("company_name", "%" + co + "%")
          .order("created_at", { ascending: false })
          .limit(20);

        if (data && data.length) {
          const tot = data.reduce((s, r) => s + (r.total_price || 0), 0);
          ctx = "INVOICES for " + co + " (" + data.length + " invoices, Total Rs." + tot.toLocaleString("en-IN") + "):\nInvNo|Date|Description|Amount|PDF\n";
          data.forEach(r => { ctx += (r.invoice_no || "") + "|" + (r.created_at || "").split("T")[0] + "|" + (r.description || "").slice(0, 40) + "|Rs." + (r.total_price || 0).toLocaleString("en-IN") + "|" + (r.invoice_pdf || "N/A") + "\n"; });
        } else {
          // Try word by word for suggestions
          const words = co.split(" ").filter(w => w.length > 2);
          let suggestions = [];
          for (const w of words) {
            const { data: sd } = await supabase.from("sales").select("company_name").ilike("company_name", "%" + w + "%").limit(10);
            if (sd) suggestions.push(...sd.map(r => r.company_name).filter(Boolean));
          }
          suggestions = [...new Set(suggestions)].slice(0, 6);
          if (suggestions.length > 0) {
            ctx = "SUGGESTIONS:" + suggestions.join("|");
          } else {
            ctx = "No invoices found for \'" + co + "\'. No similar companies found either.";
          }
        }
      }
    }
  }

  else if (type === "EXPENSE") {
    const catMap = {
      "phone": "Phone and Internet", "mobile": "Phone and Internet",
      "travel": "Travel Exp", "conveyance": "Travel Exp",
      "electricity": "Utility Direc", "bijli": "Utility Direc",
      "insurance": "INSURANCE", "maintenance": "Repair & Maintenance",
      "branding": "BRANDING EXP", "marketing": "BRANDING EXP",
      "commission": "COMMISSION EXP", "stationery": "Stationery"
    };
    let cat = null;
    for (const [k, v] of Object.entries(catMap)) { if (q.includes(k)) { cat = v; break; } }
    if (cat) {
      const { data } = await supabase.from("expenses").select("date,party_name,amount").ilike("sub_group", "%" + cat + "%").limit(100);
      if (data) {
        const tot = data.reduce((s, r) => s + (r.amount || 0), 0);
        ctx = cat + " (Rs." + tot.toLocaleString("en-IN") + ", " + data.length + " records):\nDate|Party|Amount\n";
        data.forEach(r => { ctx += (r.date || "").split("T")[0] + "|" + (r.party_name || "") + "|Rs." + (r.amount || 0) + "\n"; });
      }
    } else if (q.includes("monthly") || q.includes("month") || q.includes("comparison") || q.includes("compare") || q.includes("mahina") || q.includes("mahine")) {
      const { data } = await supabase.from("expenses").select("date,amount").limit(1000);
      if (data) {
        const bm = {};
        data.forEach(r => { const m = (r.date || "").substring(0, 7); if (m) bm[m] = (bm[m] || 0) + (r.amount || 0); });
        ctx = "MONTHLY EXPENSES:\nMonth|Total\n";
        Object.entries(bm).sort().forEach(([m, a]) => { ctx += m + "|Rs." + a.toLocaleString("en-IN") + "\n"; });
        ctx += "GRAND TOTAL: Rs." + data.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString("en-IN");
      }
    } else {
      const { data } = await supabase.from("expenses").select("sub_group,amount").limit(1000);
      if (data) {
        const bg = {};
        data.forEach(r => { bg[r.sub_group || "Other"] = (bg[r.sub_group || "Other"] || 0) + (r.amount || 0); });
        ctx = "EXPENSE SUMMARY:\nCategory|Total\n";
        Object.entries(bg).sort((a, b) => b[1] - a[1]).forEach(([g, a]) => { ctx += g + "|Rs." + a.toLocaleString("en-IN") + "\n"; });
        ctx += "TOTAL: Rs." + data.reduce((s, r) => s + (r.amount || 0), 0).toLocaleString("en-IN");
      }
    }
  }

  else if (type === "SALES") {
    const q2 = question.toLowerCase();

    // Top clients by total sales
    const { data: salesData } = await supabase.from("sales")
      .select("company_name,total_price,description,invoice_no,created_at")
      .order("total_price", { ascending: false })
      .limit(500);

    if (salesData && salesData.length) {
      // Aggregate by company
      const byCompany = {};
      salesData.forEach(r => {
        const co = r.company_name || "Unknown";
        byCompany[co] = (byCompany[co] || 0) + (r.total_price || 0);
      });
      const sorted = Object.entries(byCompany).sort((a,b) => b[1]-a[1]);

      if (q2.includes("top") || q2.includes("client") || q2.includes("customer")) {
        const topN = q2.match(/top\s*(\d+)/i);
        const n = topN ? parseInt(topN[1]) : 10;
        ctx = "TOP CLIENTS BY SALES (Top " + n + "):\nRank|Company|Total Sales\n";
        sorted.slice(0, n).forEach(([co, amt], i) => {
          ctx += (i+1) + "|" + co + "|Rs." + amt.toLocaleString("en-IN") + "\n";
        });
        ctx += "GRAND TOTAL: Rs." + salesData.reduce((s,r)=>s+(r.total_price||0),0).toLocaleString("en-IN");
      }

      else if (q2.includes("categor") || q2.includes("product") || q2.includes("selling")) {
        // Aggregate by description (product/category)
        const byCat = {};
        salesData.forEach(r => {
          const cat = (r.description || "Other").trim().slice(0, 50);
          byCat[cat] = (byCat[cat] || 0) + (r.total_price || 0);
        });
        const catSorted = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
        ctx = "SALES BY CATEGORY/PRODUCT:\nCategory|Total Sales\n";
        catSorted.slice(0, 20).forEach(([cat, amt]) => {
          ctx += cat + "|Rs." + amt.toLocaleString("en-IN") + "\n";
        });
        ctx += "GRAND TOTAL: Rs." + salesData.reduce((s,r)=>s+(r.total_price||0),0).toLocaleString("en-IN");
      }

      else {
        // General sales summary
        const tot = salesData.reduce((s,r)=>s+(r.total_price||0),0);
        ctx = "SALES SUMMARY (" + salesData.length + " invoices, Total Rs." + tot.toLocaleString("en-IN") + "):\nCompany|Total\n";
        sorted.slice(0, 20).forEach(([co, amt]) => {
          ctx += co + "|Rs." + amt.toLocaleString("en-IN") + "\n";
        });
      }
    } else ctx = "No sales records found.";
  }

  else {
    // GENERAL: search across all tables
    const words = question.split(" ").filter(w => w.length > 3);
    let found = false;
    for (const w of words) {
      const { data } = await supabase.from("ledger").select("name,closing_balance,mobile,contact_person").ilike("name", "%" + w + "%").limit(5);
      if (data && data.length) {
        ctx = "COMPANY INFO:\n";
        data.forEach(r => { ctx += "Name:" + r.name + "|Balance:Rs." + (r.closing_balance || 0) + "|Contact:" + (r.contact_person || "N/A") + "|Mobile:" + (r.mobile || "N/A") + "\n"; });
        found = true;
        break;
      }
    }
    if (!found) {
      // Try sales table too
      for (const w of words) {
        const { data } = await supabase.from("sales").select("company_name,total_price,invoice_no,created_at").ilike("company_name","%" + w + "%").limit(5);
        if (data && data.length) {
          ctx = "SALES RECORDS:\n";
          data.forEach(r => { ctx += r.company_name + "|" + r.invoice_no + "|Rs." + (r.total_price||0) + "|" + (r.created_at||"").split("T")[0] + "\n"; });
          found = true;
          break;
        }
      }
    }
    if (!found) ctx = "No relevant data found in any table. Please be more specific.";
  }

  return ctx;
}

// ── MAIN CHAT ROUTE ──────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], session_id, exactName } = req.body;
  if (!message) return res.status(400).json({ error: "Message required" });

  try {
    const type = detectType(message);

    // LEDGER: Direct HTML, no AI
    if (type === "LEDGER") {
      const result = await handleLedger(message, exactName || null);
      if (session_id && result.type === "html") {
        await supabase.from("chat_history").insert([
          { session_id, role: "user", content: message },
          { session_id, role: "assistant", content: result.content }
        ]);
      }
      return res.json({
        reply: result.type === "suggestions" ? result.content : (result.content || ""),
        type: result.type,
        options: result.options || []
      });
    }

    // ALL OTHERS: AI (Groq) with database context
    const ctx = await fetchContext(message, type);

    // If context returned suggestions (company not found), return them directly
    if (ctx.startsWith("SUGGESTIONS:")) {
      const options = ctx.replace("SUGGESTIONS:", "").split("|").filter(Boolean);
      return res.json({
        reply: "Company not found. Did you mean one of these?",
        type: "suggestions",
        options
      });
    }
    const sys = `You are a Sales Assistant for Mis Work India Private Limited. 
ALWAYS REPLY IN ENGLISH ONLY — even if the user writes in Hindi or Hinglish.
Keep all numbers, names, company names, dates in their original form.

USE HTML TABLES for ALL data responses (never plain text lists):
<table border='1' cellpadding='6' style='border-collapse:collapse;width:100%;font-size:12px;font-family:Arial'>

Table formats:
- PENDING: columns = Party Name | Bill Ref | Pending Amount | Overdue Days | Type. Add total row at bottom. Color amounts red.
- SALARY: columns = Employee | Total Paid. Add grand total.
- INVOICE: columns = Invoice No | Date | Description | Amount | PDF Link.
- EXPENSE: columns = Category | Total Amount. Add grand total.
- SALES: columns = Rank | Company | Total Sales. Add grand total.
- CATEGORIES: columns = Product/Category | Total Sales. Add grand total.

RULES:
- NEVER invent or guess data. Use ONLY the data provided below.
- If data is empty or not found, say clearly: "No data found for this query."
- Always show totals at the bottom of tables.
- Format all amounts as Rs. X,XX,XXX.XX (Indian format).

DATA:
${ctx}`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: sys },
          ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
          { role: "user", content: message }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    const d = await r.json();
    if (!r.ok) return res.status(500).json({ error: "AI error", details: d });
    const reply = d.choices?.[0]?.message?.content || "No response.";

    if (session_id) {
      await supabase.from("chat_history").insert([
        { session_id, role: "user", content: message },
        { session_id, role: "assistant", content: reply }
      ]);
    }

    // Detect if reply contains HTML (AI returned a table)
    const replyType = /<table|<div|<tr|<td|<th/i.test(reply) ? "html" : "text";
    res.json({ reply, type: replyType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MIS Chatbot running at http://localhost:" + PORT));
