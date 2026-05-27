// ────────────────────────────────────────────────────────────────────────────
// PAGE ENGINE — drill-down page data builders for Sprint 4.
//
// Reuses `helpers/dashboard-engine.js` column-resolver (classifyTable +
// resolveTableColumns) so any tenant whose tables we already understand for
// the dashboard automatically works here too. Each page is a focused
// deep-dive on ONE business role:
//
//   • sales       — direct from sales table
//   • outstanding — derived from PURCHASES with empty paymentdate
//   • stock       — derived running balance per item: Σ purchases_qty − Σ sales_qty
//   • ledger      — party-centric: Σ sales(party) − Σ purchases(party) = net
//                   balance + interleaved timeline
//
// Every page gracefully returns `{ empty: true, message }` when the required
// role table is missing on this tenant.
// ────────────────────────────────────────────────────────────────────────────
'use strict';

const { _internals } = require('./dashboard-engine');
const { classifyTable, resolveTableColumns } = _internals;
const { computeAging, topDefaulters } = require('./aging-buckets');

// ──────────────── small SQL helpers ────────────────

function whereDate(col, dr) {
  if (!dr || !dr.from) return 'WHERE 1=1';
  return `WHERE ${col} BETWEEN '${dr.from}' AND '${dr.to}'`;
}

function dateRange(opts) {
  // opts.from + opts.to (ISO YYYY-MM-DD) override default. Otherwise last 90d.
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  if (opts.from && opts.to) return { from: opts.from, to: opts.to };
  const start = new Date(today); start.setDate(today.getDate() - 89);
  return { from: ymd(start), to: ymd(today) };
}

function escSql(s) {
  // Single-quote escape for safe interpolation inside execute_sql RPC.
  return String(s == null ? '' : s).replace(/'/g, "''");
}

async function runSql(supabase, sql) {
  const { data, error } = await supabase.rpc('execute_sql', { query: sql });
  if (error) throw new Error(error.message);
  return data || [];
}

// ──────────────── 1. SALES PAGE ────────────────

async function buildSalesPage(supabase, roles, opts = {}) {
  const r = roles.sales;
  if (!r || !r.cols.amount || !r.cols.date) {
    return { empty: true, page: 'sales', message: 'No sales data on this tenant.' };
  }
  const t  = r.table.pg_table;
  const a  = r.cols.amount.pg_name;
  const d  = r.cols.date.pg_name;
  const p  = r.cols.party && r.cols.party.pg_name;
  const it = r.cols.item  && r.cols.item.pg_name;
  const id = r.cols.id    && r.cols.id.pg_name;
  const city = r.table.columns.find(c => /city/i.test(c.pg_name || c.name || ''));
  const cityCol = city ? city.pg_name : null;

  const dr = dateRange(opts);
  const partyQ = (opts.q || '').trim();
  const pageNum = Math.max(1, parseInt(opts.page) || 1);
  const pageSize = 20;
  const offset = (pageNum - 1) * pageSize;

  const partyFilter = (partyQ && p) ? `AND ${p} ILIKE '%${escSql(partyQ)}%'` : '';
  const distinctId = id ? `COUNT(DISTINCT ${id})` : 'COUNT(*)';

  // Run main queries in parallel
  const [
    kpiRows, trendRows, topPartiesRows, topItemsRows, byCityRows,
    invoiceRows, totalCountRow
  ] = await Promise.all([
    runSql(supabase, `
      SELECT
        COALESCE(SUM(${a}::numeric), 0)::numeric AS total,
        ${distinctId}::numeric AS count_inv,
        ${p ? `COUNT(DISTINCT ${p})` : '0'}::numeric AS unique_parties,
        COALESCE(SUM(${a}::numeric) / NULLIF(${distinctId}, 0), 0)::numeric AS avg_inv
      FROM ${t} ${whereDate(d, dr)} ${partyFilter}`),
    runSql(supabase, `
      SELECT ${d}::date AS day, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
      FROM ${t} ${whereDate(d, dr)} ${partyFilter}
      GROUP BY day ORDER BY day`),
    p ? runSql(supabase, `
      SELECT ${p} AS label, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
      FROM ${t} ${whereDate(d, dr)} AND ${p} IS NOT NULL ${partyFilter}
      GROUP BY ${p} ORDER BY v DESC NULLS LAST LIMIT 8`) : [],
    it ? runSql(supabase, `
      SELECT ${it} AS label, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
      FROM ${t} ${whereDate(d, dr)} AND ${it} IS NOT NULL ${partyFilter}
      GROUP BY ${it} ORDER BY v DESC NULLS LAST LIMIT 8`) : [],
    cityCol ? runSql(supabase, `
      SELECT ${cityCol} AS label, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
      FROM ${t} ${whereDate(d, dr)} AND ${cityCol} IS NOT NULL AND ${cityCol} <> 'NA' ${partyFilter}
      GROUP BY ${cityCol} ORDER BY v DESC NULLS LAST LIMIT 8`) : [],
    runSql(supabase, `
      SELECT
        ${d}::text AS day,
        ${id ? id : 'NULL'} AS voucher,
        ${p  ? p  : 'NULL'} AS party,
        ${it ? it : 'NULL'} AS item,
        ${a}::numeric AS amount
      FROM ${t} ${whereDate(d, dr)} ${partyFilter}
      ORDER BY ${d} DESC NULLS LAST, ${a} DESC NULLS LAST
      LIMIT ${pageSize} OFFSET ${offset}`),
    runSql(supabase, `
      SELECT COUNT(*)::bigint AS c FROM ${t} ${whereDate(d, dr)} ${partyFilter}`)
  ]);

  const kpi = kpiRows[0] || {};
  return {
    page: 'sales',
    range: dr,
    filter: { q: partyQ, page: pageNum, pageSize },
    kpis: {
      total_sales: { value: Number(kpi.total) || 0, format: 'inr' },
      invoice_count: { value: Number(kpi.count_inv) || 0, format: 'num' },
      unique_parties: { value: Number(kpi.unique_parties) || 0, format: 'num' },
      avg_invoice: { value: Number(kpi.avg_inv) || 0, format: 'inr' }
    },
    charts: {
      trend: {
        labels: trendRows.map(r => String(r.day || '')),
        data:   trendRows.map(r => Number(r.v) || 0),
        format: 'inr'
      },
      top_parties: {
        labels: topPartiesRows.map(r => r.label || 'Unknown'),
        data:   topPartiesRows.map(r => Number(r.v) || 0),
        format: 'inr'
      },
      top_items: {
        labels: topItemsRows.map(r => r.label || 'Unknown'),
        data:   topItemsRows.map(r => Number(r.v) || 0),
        format: 'inr'
      },
      by_city: {
        labels: byCityRows.map(r => r.label || 'Unknown'),
        data:   byCityRows.map(r => Number(r.v) || 0),
        format: 'inr'
      }
    },
    invoices: {
      rows: invoiceRows.map(r => ({
        date: r.day, voucher: r.voucher, party: r.party,
        item: r.item, amount: Number(r.amount) || 0
      })),
      total: Number(totalCountRow[0]?.c || 0),
      page: pageNum, pageSize
    }
  };
}

// ──────────────── 2. OUTSTANDING PAGE ────────────────
// Derived from purchases with empty paymentdate. Each row is one unpaid
// invoice; aging bucket is age = (today - c_date_actual) in days.

async function buildOutstandingPage(supabase, roles, opts = {}) {
  const r = roles.purchases;
  if (!r || !r.cols.amount || !r.cols.date) {
    return { empty: true, page: 'outstanding',
      message: 'No purchase data on this tenant — outstanding cannot be derived.' };
  }
  const t = r.table.pg_table;
  const a = r.cols.amount.pg_name;
  const d = r.cols.date.pg_name;
  const p = r.cols.party && r.cols.party.pg_name;

  // Find a paymentdate column (best-effort discovery)
  const payCol = r.table.columns.find(c =>
    /pay.*date|paid|payment_date/i.test(c.pg_name || c.name || '')
  );
  const payColName = payCol ? payCol.pg_name : null;

  const asOf = opts.as_of || new Date().toISOString().slice(0, 10);
  const unpaidWhere = payColName
    ? `(${payColName} IS NULL OR ${payColName} = '' OR ${payColName} = 'NA')`
    : `1=1`;   // if no payment column, treat all as outstanding

  // Pull all unpaid rows (capped at 5000 for sanity)
  const rows = await runSql(supabase, `
    SELECT
      ${d}::text AS date,
      ${p ? p : 'NULL'} AS party,
      ${a}::numeric AS amount
    FROM ${t}
    WHERE ${unpaidWhere}
      AND ${d} IS NOT NULL
      AND ${a} IS NOT NULL
      AND ${a}::numeric > 0
    LIMIT 5000`);

  // Use pure helpers for aging summary
  const summary = computeAging(rows, asOf);
  const top = topDefaulters(rows, asOf, 10);

  // 30-day rolling outstanding trend (new unpaid bills per day)
  const trendRows = await runSql(supabase, `
    SELECT ${d}::date AS day, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
    FROM ${t}
    WHERE ${unpaidWhere}
      AND ${d}::date >= ('${asOf}'::date - INTERVAL '90 days')
    GROUP BY day ORDER BY day`);

  return {
    page: 'outstanding',
    asOf,
    has_payment_tracking: !!payColName,
    kpis: {
      total_outstanding: { value: summary.total, format: 'inr' },
      unpaid_count:      { value: summary.totalCount, format: 'num' },
      bucket_90plus:     { value: summary.buckets['90+'] || 0, format: 'inr' },
      oldest_age:        { value: summary.oldest ? summary.oldest.age : 0, format: 'num' }
    },
    aging: summary,
    top_defaulters: top,
    trend: {
      labels: trendRows.map(r => String(r.day || '')),
      data:   trendRows.map(r => Number(r.v) || 0),
      format: 'inr'
    }
  };
}

// ──────────────── 3. STOCK PAGE ────────────────
// Per-item running balance: Σ purchases_qty − Σ sales_qty.
// Stock value approximated as remaining_qty × avg_purchase_price.

async function buildStockPage(supabase, roles, opts = {}) {
  const sales = roles.sales;
  const purch = roles.purchases;
  if (!purch || !purch.cols.item || !purch.cols.qty) {
    return { empty: true, page: 'stock',
      message: 'No item-level purchase data on this tenant — stock cannot be derived.' };
  }
  const pt  = purch.table.pg_table;
  const pi  = purch.cols.item.pg_name;
  const pq  = purch.cols.qty.pg_name;
  const pd  = purch.cols.date && purch.cols.date.pg_name;
  const pa  = purch.cols.amount && purch.cols.amount.pg_name;

  const st  = sales && sales.cols.item ? sales.table.pg_table : null;
  const si  = sales && sales.cols.item ? sales.cols.item.pg_name : null;
  const sq  = sales && sales.cols.qty  ? sales.cols.qty.pg_name : null;
  const sd  = sales && sales.cols.date ? sales.cols.date.pg_name : null;

  // Build a single CTE that joins purchase totals with sales totals per item.
  const salesCte = (st && si && sq) ? `
    , sales_agg AS (
      SELECT ${si} AS item,
             COALESCE(SUM(${sq}::numeric), 0)::numeric AS sold_qty,
             MAX(${sd ? sd : 'NULL'}::date) AS last_sale_at
      FROM ${st}
      WHERE ${si} IS NOT NULL AND ${si} <> 'NA'
      GROUP BY ${si}
    )` : '';
  const salesJoin = salesCte
    ? `LEFT JOIN sales_agg s ON s.item = p.item`
    : '';
  const soldQtyExpr = salesCte ? `COALESCE(s.sold_qty, 0)` : '0';
  const lastSaleExpr = salesCte ? `s.last_sale_at` : 'NULL';

  // Avg per-unit price derived as SUM(amount) / SUM(qty) — gives weighted
  // average rather than simple AVG which would skew on outliers. This is the
  // correct unit cost basis for stock-value approximation.
  // The tax-line filter excludes Tally's tax/round-off pseudo-items (Output
  // IGST 18%, Input CGST, Rounded Off, Out Put …) which appear as item-name
  // rows in some sheets but aren't real inventory.
  const TAX_FILTER = `
    AND ${pi} NOT ILIKE '%cgst%'
    AND ${pi} NOT ILIKE '%sgst%'
    AND ${pi} NOT ILIKE '%igst%'
    AND ${pi} NOT ILIKE '%cess%'
    AND ${pi} NOT ILIKE '%round%'
    AND ${pi} NOT ILIKE '%discount%'`;
  const SALES_TAX_FILTER = (salesCte && si) ? `
    AND ${si} NOT ILIKE '%cgst%'
    AND ${si} NOT ILIKE '%sgst%'
    AND ${si} NOT ILIKE '%igst%'
    AND ${si} NOT ILIKE '%cess%'
    AND ${si} NOT ILIKE '%round%'
    AND ${si} NOT ILIKE '%discount%'` : '';

  const sql = `
    WITH purch_agg AS (
      SELECT ${pi} AS item,
             COALESCE(SUM(${pq}::numeric), 0)::numeric AS bought_qty,
             COALESCE(SUM(${pa}::numeric), 0)::numeric AS bought_amt,
             CASE WHEN COALESCE(SUM(${pq}::numeric), 0) > 0
                  THEN COALESCE(SUM(${pa}::numeric), 0) / SUM(${pq}::numeric)
                  ELSE 0 END::numeric AS avg_price,
             MAX(${pd ? pd : 'NULL'}::date) AS last_purch_at
      FROM ${pt}
      WHERE ${pi} IS NOT NULL AND ${pi} <> 'NA'
        ${TAX_FILTER}
      GROUP BY ${pi}
    )
    ${salesCte ? `
    , sales_agg AS (
      SELECT ${si} AS item,
             COALESCE(SUM(${sq}::numeric), 0)::numeric AS sold_qty,
             MAX(${sd ? sd : 'NULL'}::date) AS last_sale_at
      FROM ${st}
      WHERE ${si} IS NOT NULL AND ${si} <> 'NA'
        ${SALES_TAX_FILTER}
      GROUP BY ${si}
    )` : ''}
    SELECT p.item,
           p.bought_qty,
           ${soldQtyExpr} AS sold_qty,
           (p.bought_qty - ${soldQtyExpr})::numeric AS balance_qty,
           p.avg_price,
           -- Stock value floors at zero (negative balances mean over-sold,
           -- not negative inventory worth)
           GREATEST(0, (p.bought_qty - ${soldQtyExpr}) * p.avg_price)::numeric AS stock_value,
           p.last_purch_at,
           ${lastSaleExpr} AS last_sale_at
    FROM purch_agg p
    ${salesJoin}
    ORDER BY stock_value DESC NULLS LAST
    LIMIT 200`;

  const rows = await runSql(supabase, sql);

  const items = rows.map(r => ({
    item: r.item,
    bought_qty: Number(r.bought_qty) || 0,
    sold_qty: Number(r.sold_qty) || 0,
    balance_qty: Number(r.balance_qty) || 0,
    avg_price: Number(r.avg_price) || 0,
    stock_value: Number(r.stock_value) || 0,
    last_purch_at: r.last_purch_at,
    last_sale_at: r.last_sale_at
  }));

  // Aggregations
  const totalValue = items.reduce((s, x) => s + (x.stock_value > 0 ? x.stock_value : 0), 0);
  const lowStock = items.filter(x => x.balance_qty <= 0);
  const today = new Date();
  const slow = items.filter(x => {
    if (x.balance_qty <= 0) return false;
    const last = x.last_sale_at ? new Date(x.last_sale_at) : null;
    if (!last || isNaN(last.getTime())) return true;
    const days = Math.floor((today - last) / 86_400_000);
    return days >= 30;
  }).slice(0, 20);

  return {
    page: 'stock',
    has_sales_data: !!salesCte,
    kpis: {
      total_value: { value: Math.round(totalValue * 100) / 100, format: 'inr' },
      sku_count:   { value: items.length, format: 'num' },
      low_stock_count: { value: lowStock.length, format: 'num' },
      slow_moving_count: { value: slow.length, format: 'num' }
    },
    top_value_items: items.filter(x => x.stock_value > 0).slice(0, 10),
    low_stock: lowStock.slice(0, 20),
    slow_moving: slow,
    items_table: items.slice(0, 100)   // cap displayed rows
  };
}

// ──────────────── 4. LEDGER PAGE ────────────────
// Party-centric. If `q` provided → focused view of that party. Else top
// parties summary.

async function buildLedgerPage(supabase, roles, opts = {}) {
  const sales = roles.sales;
  const purch = roles.purchases;
  if ((!sales || !sales.cols.party) && (!purch || !purch.cols.party)) {
    return { empty: true, page: 'ledger',
      message: 'No party-level data on this tenant — ledger cannot be derived.' };
  }

  const partyQ = (opts.party || opts.q || '').trim();

  // 1. Top parties summary (always shown when no specific search)
  const summarySql = `
    WITH s AS (
      ${sales && sales.cols.party ? `
        SELECT ${sales.cols.party.pg_name} AS party,
               COALESCE(SUM(${sales.cols.amount.pg_name}::numeric), 0)::numeric AS sales_amt,
               COUNT(*)::int AS sales_count
        FROM ${sales.table.pg_table}
        WHERE ${sales.cols.party.pg_name} IS NOT NULL AND ${sales.cols.party.pg_name} <> 'NA'
        GROUP BY ${sales.cols.party.pg_name}
      ` : `SELECT NULL::text AS party, 0::numeric AS sales_amt, 0::int AS sales_count WHERE FALSE`}
    ), p AS (
      ${purch && purch.cols.party ? `
        SELECT ${purch.cols.party.pg_name} AS party,
               COALESCE(SUM(${purch.cols.amount.pg_name}::numeric), 0)::numeric AS purch_amt,
               COUNT(*)::int AS purch_count
        FROM ${purch.table.pg_table}
        WHERE ${purch.cols.party.pg_name} IS NOT NULL AND ${purch.cols.party.pg_name} <> 'NA'
        GROUP BY ${purch.cols.party.pg_name}
      ` : `SELECT NULL::text AS party, 0::numeric AS purch_amt, 0::int AS purch_count WHERE FALSE`}
    )
    SELECT COALESCE(s.party, p.party) AS party,
           COALESCE(s.sales_amt, 0)   AS sales_amt,
           COALESCE(p.purch_amt, 0)   AS purch_amt,
           (COALESCE(s.sales_amt, 0) - COALESCE(p.purch_amt, 0)) AS net_balance,
           COALESCE(s.sales_count, 0) AS sales_count,
           COALESCE(p.purch_count, 0) AS purch_count
    FROM s
    FULL OUTER JOIN p ON s.party = p.party
    WHERE COALESCE(s.party, p.party) IS NOT NULL
    ORDER BY ABS(COALESCE(s.sales_amt, 0) - COALESCE(p.purch_amt, 0)) DESC NULLS LAST
    LIMIT 50`;
  const summary = await runSql(supabase, summarySql);

  // 2. If party search provided → fetch transactions for that specific party
  let partyDetail = null;
  if (partyQ) {
    // ── 2a. Compute TRUE totals via aggregates (NOT capped by transaction
    //        LIMIT) — earlier version derived totals from a LIMIT 200 fetch
    //        which silently truncated balances for high-volume parties.
    const totalsQueries = [];
    if (sales && sales.cols.party) {
      totalsQueries.push(runSql(supabase, `
        SELECT COALESCE(SUM(${sales.cols.amount.pg_name}::numeric), 0)::numeric AS total,
               COUNT(*)::int AS cnt
        FROM ${sales.table.pg_table}
        WHERE ${sales.cols.party.pg_name} ILIKE '%${escSql(partyQ)}%'`));
    } else { totalsQueries.push(Promise.resolve([{ total: 0, cnt: 0 }])); }
    if (purch && purch.cols.party) {
      totalsQueries.push(runSql(supabase, `
        SELECT COALESCE(SUM(${purch.cols.amount.pg_name}::numeric), 0)::numeric AS total,
               COUNT(*)::int AS cnt
        FROM ${purch.table.pg_table}
        WHERE ${purch.cols.party.pg_name} ILIKE '%${escSql(partyQ)}%'`));
    } else { totalsQueries.push(Promise.resolve([{ total: 0, cnt: 0 }])); }
    const [salesAgg, purchAgg] = await Promise.all(totalsQueries);
    const salesTotal = Number(salesAgg[0]?.total) || 0;
    const salesCount = Number(salesAgg[0]?.cnt)   || 0;
    const purchTotal = Number(purchAgg[0]?.total) || 0;
    const purchCount = Number(purchAgg[0]?.cnt)   || 0;

    // ── 2b. Fetch most-recent 100 transactions per side for the timeline.
    //        Display-only, doesn't influence balance totals.
    const txnQueries = [];
    if (sales && sales.cols.party) {
      txnQueries.push(runSql(supabase, `
        SELECT 'sale' AS kind,
               ${sales.cols.date.pg_name}::text AS date,
               ${sales.cols.id ? sales.cols.id.pg_name : 'NULL'} AS voucher,
               ${sales.cols.amount.pg_name}::numeric AS amount,
               ${sales.cols.item ? sales.cols.item.pg_name : 'NULL'} AS item,
               ${sales.cols.party.pg_name} AS party
        FROM ${sales.table.pg_table}
        WHERE ${sales.cols.party.pg_name} ILIKE '%${escSql(partyQ)}%'
        ORDER BY ${sales.cols.date.pg_name} DESC NULLS LAST
        LIMIT 100`));
    }
    if (purch && purch.cols.party) {
      txnQueries.push(runSql(supabase, `
        SELECT 'purchase' AS kind,
               ${purch.cols.date.pg_name}::text AS date,
               ${purch.cols.id ? purch.cols.id.pg_name : 'NULL'} AS voucher,
               ${purch.cols.amount.pg_name}::numeric AS amount,
               ${purch.cols.item ? purch.cols.item.pg_name : 'NULL'} AS item,
               ${purch.cols.party.pg_name} AS party
        FROM ${purch.table.pg_table}
        WHERE ${purch.cols.party.pg_name} ILIKE '%${escSql(partyQ)}%'
        ORDER BY ${purch.cols.date.pg_name} DESC NULLS LAST
        LIMIT 100`));
    }
    const allTxn = (await Promise.all(txnQueries)).flat();
    allTxn.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    partyDetail = {
      query: partyQ,
      matched_count: salesCount + purchCount,        // TRUE count from aggregates
      transactions_shown: Math.min(allTxn.length, 100),
      sales_total:     Math.round(salesTotal * 100) / 100,
      purchases_total: Math.round(purchTotal * 100) / 100,
      net_balance:     Math.round((salesTotal - purchTotal) * 100) / 100,
      transactions:    allTxn.slice(0, 100)
    };
  }

  return {
    page: 'ledger',
    summary: summary.map(r => ({
      party: r.party,
      sales_amt: Number(r.sales_amt) || 0,
      purch_amt: Number(r.purch_amt) || 0,
      net_balance: Number(r.net_balance) || 0,
      sales_count: Number(r.sales_count) || 0,
      purch_count: Number(r.purch_count) || 0
    })),
    party_detail: partyDetail
  };
}

// ──────────────── DISPATCHER ────────────────

async function buildPageData(supabase, tenantId, page, opts = {}) {
  // 1. Load tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, phone, tables_metadata')
    .eq('id', tenantId)
    .maybeSingle();
  if (tErr || !tenant) {
    return { error: 'Tenant not found' };
  }
  const tablesMeta = Array.isArray(tenant.tables_metadata) ? tenant.tables_metadata : [];

  // 2. Classify + resolve columns (same path dashboard-engine uses)
  const roles = {};
  for (const meta of tablesMeta) {
    const kind = classifyTable(meta);
    if (kind === 'other') continue;
    const cols = resolveTableColumns(meta, kind);
    if (!roles[kind] || (meta.row_count || 0) > (roles[kind].table.row_count || 0)) {
      roles[kind] = { table: meta, cols };
    }
  }

  // 3. Dispatch
  let payload;
  try {
    switch (String(page).toLowerCase()) {
      case 'sales':       payload = await buildSalesPage(supabase, roles, opts);       break;
      case 'outstanding': payload = await buildOutstandingPage(supabase, roles, opts); break;
      case 'stock':       payload = await buildStockPage(supabase, roles, opts);       break;
      case 'ledger':      payload = await buildLedgerPage(supabase, roles, opts);      break;
      default: return { error: `Unknown page: ${page}` };
    }
  } catch (e) {
    return { error: e.message, page };
  }

  return {
    tenant: { id: tenant.id, name: tenant.name },
    ...payload
  };
}

module.exports = {
  buildPageData,
  // exposed for unit tests
  _internals: { buildSalesPage, buildOutstandingPage, buildStockPage, buildLedgerPage }
};
