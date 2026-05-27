const SHEET_ID = "1ZJVFQ5zETwqoiZ5isqRxcKzLzLRwrLiFjqLwEqATBw4";

// GIDs for each tab — kept as fallback in case auto-discovery fails or a tab is renamed.
// Auto-discovery (Phase 8.5) overrides these at sync time using helpers/sheets.js discoverTabs().
const GIDS = {
  SALES: "0",
  EXPENSES: "1821314686",
  PENDING: "1139038815",
  LEDGER: "787078297",
  PRODUCTS: "1842741177",
  DELEGATION: "777508230",
  CHECKLIST: "1816368466",
  SCORES: "1700278726",
  ACCESS_CONTROL: "91964318"
};

// ── Phase 8.5: Multi-tab auto-discovery ───────────────────────────────────
// Calls discoverTabs() to fetch live tab list from the sheet's HTML view,
// then matches tab names (case-insensitive, fuzzy on substring) to the
// internal GIDS keys. Falls back to hardcoded GIDS for any unmatched tab.
let { discoverTabs } = (() => { try { return require('./sheets'); } catch (e) { return { discoverTabs: null }; } })();

// Reverse-tolerant name matcher (case + space + underscore insensitive)
function _normName(s) {
  return String(s || '').toLowerCase().replace(/[\s_-]+/g, '').replace(/access(control)?o?$/, 'accesscontrol');
}

const _TAB_ALIASES = {
  sales:         'SALES',
  expenses:      'EXPENSES',
  pending:       'PENDING',
  ledger:        'LEDGER',
  products:      'PRODUCTS',
  delegation:    'DELEGATION',
  checklist:     'CHECKLIST',
  scores:        'SCORES',
  accesscontrol: 'ACCESS_CONTROL',
  accesscontro:  'ACCESS_CONTROL',  // Some sheets use 13-char tab limit "ACCESS_CONTRO"
};

let _gidCache = null;
let _gidCacheAt = 0;
const _GID_TTL = 15 * 60 * 1000; // 15 min — refreshes between sync cycles

async function getGids() {
  if (_gidCache && Date.now() - _gidCacheAt < _GID_TTL) return _gidCache;
  const resolved = { ...GIDS };
  if (typeof discoverTabs === 'function') {
    try {
      const tabs = await discoverTabs(SHEET_ID);
      for (const t of tabs || []) {
        const alias = _TAB_ALIASES[_normName(t.name)];
        if (alias && t.gid) resolved[alias] = t.gid;
      }
      console.log('[SYNC] Auto-discovered tab GIDs:', Object.entries(resolved).map(([k, v]) => `${k}=${v}`).join(', '));
    } catch (e) {
      console.warn('[SYNC] discoverTabs failed, using hardcoded GIDs:', e.message);
    }
  }
  _gidCache = resolved;
  _gidCacheAt = Date.now();
  return _gidCache;
}

async function fetchSheetCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return res.text();
}

// Phase 22 Sprint 1.9 — proper RFC 4180 CSV parser. Handles:
//   • newlines inside quoted fields (multi-line cells)
//   • escaped quotes ("" → " inside a quoted field)
//   • CRLF and LF line endings
//   • leading/trailing whitespace in quoted fields preserved
//   • empty trailing field on a row
function parseCSV(text) {
  if (!text) return [];
  const records = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        // Look-ahead for escaped quote
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ""; }
      else if (ch === '\r') { /* skip — handled by \n */ }
      else if (ch === '\n') {
        row.push(field); field = "";
        // Skip blank lines
        if (row.some(c => c !== "")) records.push(row);
        row = [];
      }
      else field += ch;
    }
  }
  // Flush last field/row if file doesn't end with newline
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some(c => c !== "")) records.push(row);
  }
  if (records.length < 2) return [];

  const headers = records[0].map(h => String(h).trim());
  return records.slice(1).map(cols => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cols[i] !== undefined ? String(cols[i]).trim() : ""); });
    return obj;
  });
}

function toFloat(val) {
  if (!val) return 0;
  return parseFloat(String(val).replace(/[₹,]/g, "").trim()) || 0;
}

function toDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === "null" || s === "undefined") return null;
  return s.split("T")[0] + "T00:00:00";
}

async function syncTable(supabase, table, gid, mapFn) {
  try {
    const csv = await fetchSheetCSV(gid);
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    await supabase.from(table).delete().neq("id", 0);
    const toInsert = rows.map(mapFn).filter(Boolean);
    for (let i = 0; i < toInsert.length; i += 500) {
      await supabase.from(table).insert(toInsert.slice(i, i + 500));
    }
    await supabase.from("sync_log").insert({ sheet_name: table, rows_synced: toInsert.length, status: "success" });
    console.log(`[SYNC] ${table}: ${toInsert.length}`);
    return toInsert.length;
  } catch (e) {
    console.error(`[SYNC] ${table} error:`, e.message);
    try { await supabase.from("sync_log").insert({ sheet_name: table, rows_synced: 0, status: "error: " + e.message }); } catch(_) {}
    return 0;
  }
}

async function syncSales(supabase) {
  return syncTable(supabase, "sales", GIDS.SALES, r => {
    if (!r.invoice_no && !r.company_name) return null;
    return {
      invoice_no: r.invoice_no || "",
      company_name: r.company_name || "",
      address: r.address || "",
      state: r.state || "",
      gst_no: r.gst_no || "",
      contact_person: r.contact_person || "",
      phone: r.phone || "",
      description: r.description || "",
      total_price: toFloat(r.total_price),
      category: r.category || "",
      invoice_pdf: r.invoice_pdf || "",
      created_at: toDate(r.created_at)
    };
  });
}

async function syncExpenses(supabase) {
  return syncTable(supabase, "expenses", GIDS.EXPENSES, r => {
    if (!r.party_name && !r.amount) return null;
    return {
      date: toDate(r.date),
      voucher_no: r.voucher_no || "",
      party_name: r.party_name || "",
      grp: r.grp || "",
      sub_group: r.sub_group || "",
      design_number: r.design_number || "",
      amount: toFloat(r.amount),
      type: r.type || ""
    };
  });
}

async function syncPending(supabase) {
  return syncTable(supabase, "pending", GIDS.PENDING, r => {
    if (!r.party_name && !r.pending_amount) return null;
    return {
      bill_date: toDate(r.bill_date),
      bill_ref_no: r.bill_ref_no || "",
      party_name: r.party_name || "",
      party_group: r.party_group || "",
      sub_group: r.sub_group || "",
      sales_person: r.sales_person || "",
      pending_amount: String(toFloat(r.pending_amount)),
      due_date: toDate(r.due_date),
      overdue_days: toFloat(r.overdue_days)
    };
  });
}

async function syncLedger(supabase) {
  return syncTable(supabase, "ledger", GIDS.LEDGER, r => {
    if (!r.name) return null;
    return {
      name: r.name || "",
      subgroup: r.subgroup || "",
      state: r.state || "",
      email: r.email || "",
      contact_person: r.contact_person || "",
      mobile: r.mobile || "",
      opening_balance: toFloat(r.opening_balance),
      voucher_date: toDate(r.voucher_date),
      voucher_particular: r.voucher_particular || "",
      voucher_type: r.voucher_type || "",
      voucher_no: r.voucher_no || "",
      voucher_debit: toFloat(r.voucher_debit),
      voucher_credit: toFloat(r.voucher_credit),
      closing_balance: toFloat(r.closing_balance)
    };
  });
}

async function syncProducts(supabase) {
  return syncTable(supabase, "products", GIDS.PRODUCTS, r => {
    if (!r.item_name) return null;
    return {
      item_name: r.item_name || "",
      image_link: r.image_link || "",
      description: r.description || ""
    };
  });
}

async function syncDelegationTasks(supabase) {
  return syncTable(supabase, "delegation_tasks", GIDS.DELEGATION, r => {
    if (!r.task_name) return null;
    return {
      del_task_id: r.del_task_id || "",
      plan_date: toDate(r.plan_date),
      final_date: toDate(r.final_date),
      delegate_from: r.delegate_from || "",
      delegated_to: r.delegated_to || "",
      project_name: r.project_name || "",
      task_name: r.task_name || "",
      del_remarks: r.del_remarks || "",
      priority: r.priority || "",
      department_id: r.department_id || "",
      del_url: r.del_url || ""
    };
  });
}

async function syncChecklistTasks(supabase) {
  return syncTable(supabase, "checklist_tasks", GIDS.CHECKLIST, r => {
    if (!r.task_name && !r.assigned_to) return null;
    return {
      task_name: r.task_name || "",
      assigned_to: r.assigned_to || "",
      status: r.status || "",
      priority: r.priority || "",
      remarks: r.remarks || "",
      department: r.department || ""
    };
  });
}

async function syncScores(supabase) {
  return syncTable(supabase, "scores", GIDS.SCORES, r => {
    if (!r.employee_name) return null;
    return {
      employee_name: r.employee_name || "",
      score_value: r.score_value || "",
      category: r.category || "",
      period: r.period || "",
      remarks: r.remarks || ""
    };
  });
}

async function syncAccessControl(supabase) {
  try {
    const csv = await fetchSheetCSV(GIDS.ACCESS_CONTROL);
    const rows = parseCSV(csv);
    if (!rows.length) return 0;
    
    const fs = require("fs");
    const path = require("path");
    
    const accessData = {
      mode: "LIST",
      allowed_numbers: [],
      users: {}
    };
    
    rows.forEach(r => {
      const phone = String(r.phone_number || "").trim();
      const name = String(r.name || "").trim();
      const access = String(r.access_mode || "ALL").trim().toUpperCase();
      const status = String(r.status || "active").trim().toLowerCase();
      
      if (!phone || status === "blocked") return;
      
      accessData.allowed_numbers.push(phone);
      accessData.users[phone] = {
        name,
        access,
        status,
        can_view_sales: String(r.can_view_sales || "YES").toUpperCase(),
        can_view_expenses: String(r.can_view_expenses || "YES").toUpperCase(),
        can_view_pending: String(r.can_view_pending || "YES").toUpperCase(),
        can_view_ledger: String(r.can_view_ledger || "NO").toUpperCase(),
        can_view_products: String(r.can_view_products || "YES").toUpperCase(),
        can_view_delegation: String(r.can_view_delegation || "YES").toUpperCase(),
        can_view_checklist: String(r.can_view_checklist || "YES").toUpperCase()
      };
    });
    
    const filePath = path.join(__dirname, "..", "access_control.json");
    fs.writeFileSync(filePath, JSON.stringify(accessData, null, 2));
    
    console.log(`[SYNC] access_control: ${rows.length} users`);
    return rows.length;
  } catch (e) {
    console.error(`[SYNC] access_control error:`, e.message);
    return 0;
  }
}

async function syncAllSheets(supabase) {
  console.log("[SYNC] Starting full sync from Google Sheet...");
  // Phase 8.5: refresh GID map from live sheet (auto-detects tab renames / GID changes)
  const gids = await getGids();
  // Temporarily rebind GIDS so downstream sync functions pick up the latest GIDs.
  // (Each sync function reads GIDS at call time, not at module load.)
  Object.assign(GIDS, gids);

  const results = {
    sales: await syncSales(supabase),
    expenses: await syncExpenses(supabase),
    pending: await syncPending(supabase),
    ledger: await syncLedger(supabase),
    products: await syncProducts(supabase),
    delegation_tasks: await syncDelegationTasks(supabase),
    checklist_tasks: await syncChecklistTasks(supabase),
    scores: await syncScores(supabase),
    access_control: await syncAccessControl(supabase)
  };
  console.log("[SYNC] Done:", results);
  return results;
}

module.exports = { syncAllSheets, syncSales, syncExpenses, syncPending, syncLedger, syncProducts, syncDelegationTasks, syncChecklistTasks, syncScores, syncAccessControl };
