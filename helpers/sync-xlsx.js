const XLSX = require("xlsx");
const path = require("path");

const XLSX_PATH = path.join(__dirname, "..", "SARANSH.xlsx");

function toFloat(val) {
  if (val == null || val === "") return 0;
  return parseFloat(String(val).replace(/[₹,]/g, "").trim()) || 0;
}

function excelDateToISO(val) {
  if (!val) return null;
  if (typeof val === "number") {
    return new Date((val - 25569) * 86400000).toISOString().split("T")[0] + "T00:00:00";
  }
  const s = String(val).trim();
  if (!s || s === "nan" || s === "NaT") return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().split(".")[0];
}

function readSheet(sheetName) {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

async function syncSales(supabase) {
  try {
    const rows = readSheet("SALE DATABASE");
    if (!rows.length) return 0;
    await supabase.from("sales").delete().neq("id", 0);
    const toInsert = rows.filter(r => r["Invoice No."] || r["INVOICE TO"]).map(r => ({
      invoice_no: String(r["Invoice No."] || ""),
      company_name: String(r["INVOICE TO"] || ""),
      address: String(r["Address"] || ""),
      state: String(r["State"] || ""),
      gst_no: String(r["GST No."] || ""),
      contact_person: String(r["Contact Person Name"] || ""),
      phone: String(r["Phone"] || ""),
      description: String(r["DESCRIPTION"] || ""),
      total_price: toFloat(r["TOTAL PRICE"]),
      category: String(r["CATEGORY"] || ""),
      invoice_pdf: String(r["INVOICE PDF"] || ""),
      created_at: excelDateToISO(r["TimeStamp"])
    }));
    for (let i = 0; i < toInsert.length; i += 500) {
      await supabase.from("sales").insert(toInsert.slice(i, i + 500));
    }
    await supabase.from("sync_log").insert({ sheet_name: "sales", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Sales:", toInsert.length);
    return toInsert.length;
  } catch (e) {
    console.error("[SYNC] Sales error:", e.message);
    await supabase.from("sync_log").insert({ sheet_name: "sales", rows_synced: 0, status: "error: " + e.message }).catch(() => {});
    return 0;
  }
}

async function syncExpenses(supabase) {
  try {
    const rows = readSheet("EXPENSES");
    if (!rows.length) return 0;
    await supabase.from("expenses").delete().neq("id", 0);
    const toInsert = rows.filter(r => r["PARTY NAME"] || r["AMOUNT"]).map(r => ({
      date: excelDateToISO(r["DATE"]),
      voucher_no: String(r["VOUCHER NUMBER"] || ""),
      party_name: String(r["PARTY NAME"] || ""),
      grp: String(r["Group"] || ""),
      sub_group: String(r["Sub_Group"] || ""),
      design_number: String(r["DESIGN NUMBER"] || ""),
      amount: toFloat(r["AMOUNT"]),
      type: String(r["TYPE"] || "")
    }));
    for (let i = 0; i < toInsert.length; i += 500) {
      await supabase.from("expenses").insert(toInsert.slice(i, i + 500));
    }
    await supabase.from("sync_log").insert({ sheet_name: "expenses", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Expenses:", toInsert.length);
    return toInsert.length;
  } catch (e) {
    console.error("[SYNC] Expenses error:", e.message);
    await supabase.from("sync_log").insert({ sheet_name: "expenses", rows_synced: 0, status: "error: " + e.message }).catch(() => {});
    return 0;
  }
}

async function syncPending(supabase) {
  try {
    const rows = readSheet("PENDING RECEIPT");
    if (!rows.length) return 0;
    await supabase.from("pending").delete().neq("id", 0);
    const toInsert = rows.filter(r => r["Party_Name"] || r["Pending Amount"]).map(r => ({
      bill_date: excelDateToISO(r["Bill_Date"]),
      bill_ref_no: String(r["Bill_Ref_No"] || ""),
      party_name: String(r["Party_Name"] || ""),
      party_group: String(r["Party_Group"] || ""),
      sub_group: String(r["Sub_Group"] || ""),
      sales_person: String(r["Sales Person"] || ""),
      pending_amount: String(toFloat(r["Pending Amount"])),
      due_date: excelDateToISO(r["Due_Date"]),
      overdue_days: toFloat(r["Overdue_Days"])
    }));
    for (let i = 0; i < toInsert.length; i += 500) {
      await supabase.from("pending").insert(toInsert.slice(i, i + 500));
    }
    await supabase.from("sync_log").insert({ sheet_name: "pending", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Pending:", toInsert.length);
    return toInsert.length;
  } catch (e) {
    console.error("[SYNC] Pending error:", e.message);
    await supabase.from("sync_log").insert({ sheet_name: "pending", rows_synced: 0, status: "error: " + e.message }).catch(() => {});
    return 0;
  }
}

async function syncLedger(supabase) {
  try {
    const rows = readSheet("LEDGER BALANCE");
    if (!rows.length) return 0;
    await supabase.from("ledger").delete().neq("id", 0);
    const toInsert = rows.filter(r => r["Name"]).map(r => ({
      name: String(r["Name"] || ""),
      subgroup: String(r["Subgroup"] || ""),
      state: String(r["State"] || ""),
      email: String(r["Email"] || ""),
      contact_person: String(r["Contact Person"] || ""),
      mobile: String(r["Mobile"] || ""),
      opening_balance: toFloat(r["Opening Balance"]),
      voucher_date: excelDateToISO(r["Voucher Date"]),
      voucher_particular: String(r["Voucher Particular"] || ""),
      voucher_type: String(r["Voucher Type"] || ""),
      voucher_no: String(r["Voucher No"] || ""),
      voucher_debit: toFloat(r["Voucher Debit"]),
      voucher_credit: toFloat(r["Voucher Credit"]),
      closing_balance: toFloat(r["Closing Balance"])
    }));
    for (let i = 0; i < toInsert.length; i += 500) {
      await supabase.from("ledger").insert(toInsert.slice(i, i + 500));
    }
    await supabase.from("sync_log").insert({ sheet_name: "ledger", rows_synced: toInsert.length, status: "success" });
    console.log("[SYNC] Ledger:", toInsert.length);
    return toInsert.length;
  } catch (e) {
    console.error("[SYNC] Ledger error:", e.message);
    await supabase.from("sync_log").insert({ sheet_name: "ledger", rows_synced: 0, status: "error: " + e.message }).catch(() => {});
    return 0;
  }
}

async function syncXlsxData(supabase) {
  console.log("[SYNC-XLSX] Starting...");
  const results = {
    sales: await syncSales(supabase),
    expenses: await syncExpenses(supabase),
    pending: await syncPending(supabase),
    ledger: await syncLedger(supabase)
  };
  console.log("[SYNC-XLSX] Done:", results);
  return results;
}

module.exports = { syncXlsxData, syncSales, syncExpenses, syncPending, syncLedger };
