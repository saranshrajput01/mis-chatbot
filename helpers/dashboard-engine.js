// helpers/dashboard-engine.js
// ────────────────────────────────────────────────────────────────────────────
// Phase 20 Sprint 2 — Dynamic Dashboard Engine
// Reads a tenant's tables_metadata, scores columns for known roles, picks the
// best widgets (KPIs / charts / tables) the tenant's data can support, and
// runs aggregation SQL for each widget.
//
// Public API:
//   buildDashboard(supabase, tenantId, opts) → {
//     tenant, range, date_range, widgets:[ {kind,id,title,...,data,ok,error} ]
//   }
//
// Design principles:
//   • Pure function output — no DOM / framework deps.
//   • Schema-driven — works for any tenant who synced any sheet shape.
//   • Graceful degradation — missing data => widget skipped, never an error.
// ────────────────────────────────────────────────────────────────────────────
'use strict';

const { detectAnomaly } = require('./anomaly');

// ──────────────── 1. RANGE → DATE WINDOW ────────────────
function computeDateRange(range = 'month') {
  const today = new Date();
  const ymd = (d) => d.toISOString().slice(0, 10);
  const start = new Date(today);
  switch (String(range).toLowerCase()) {
    case 'today':  /* same day */                                  break;
    case 'week':   start.setDate(today.getDate() - 6);              break;
    case 'month':  start.setDate(today.getDate() - 29);             break;
    case 'quarter':start.setDate(today.getDate() - 89);             break;
    case 'year':   start.setDate(today.getDate() - 364);            break;
    case 'all':    return { from: null, to: null, label: 'All-time' };
    default:       start.setDate(today.getDate() - 29);
  }
  return { from: ymd(start), to: ymd(today), label: range };
}

function previousRange(dr) {
  if (!dr.from) return { from: null, to: null };
  const f = new Date(dr.from), t = new Date(dr.to);
  const days = Math.round((t - f) / 86400000) + 1;
  const prevTo = new Date(f); prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
  const ymd = (d) => d.toISOString().slice(0, 10);
  return { from: ymd(prevFrom), to: ymd(prevTo) };
}

// ──────────────── 2. TABLE / COLUMN ROLE DETECTION ────────────────
// Decide what a tenant's table represents based on its name + column shape.
function classifyTable(meta) {
  const name = String(meta.source_name || meta.pg_table || '').toLowerCase();
  if (/(^|_)sale|invoic|billing/.test(name))           return 'sales';
  if (/(^|_)purchas|buy|vendor_inv/.test(name))        return 'purchases';
  if (/outstand|pending|receivab|debt|due|aging/.test(name)) return 'outstanding';
  if (/payment|collect|remit/.test(name))              return 'payments';
  if (/stock|inventor/.test(name))                     return 'stock';
  if (/ledger|account/.test(name))                     return 'ledger';
  if (/expens|cost/.test(name))                        return 'expenses';
  if (/lead|prospect/.test(name))                      return 'leads';
  // Heuristic fallback — a table with date + party + currency looks like sales
  const cols = meta.columns || [];
  const has = (pred) => cols.some(pred);
  const hasDate     = has(c => /date/.test(c.role || ''));
  const hasCurrency = has(c => c.role === 'currency');
  const hasEntity   = has(c => c.role === 'entity');
  if (hasDate && hasCurrency && hasEntity) return 'sales';
  return 'other';
}

// Score-based column picker. Higher score = better fit for the role.
//   spec.role          — preferred role tag
//   spec.namesBoost    — list of [regex, points] pairs to boost names
//   spec.namesPenalty  — list of [regex, points] pairs to penalise
//   spec.requirePgType — only consider columns whose pg_type matches
function pickColumn(table, spec = {}) {
  const cols = table.columns || [];
  let best = null, bestScore = 0;
  for (const c of cols) {
    let score = 0;
    const pg = String(c.pg_name || c.name || '').toLowerCase();
    if (spec.role && c.role === spec.role) score += 10;
    if (Array.isArray(spec.namesBoost)) {
      for (const [re, pts] of spec.namesBoost) if (re.test(pg)) score += pts;
    }
    if (Array.isArray(spec.namesPenalty)) {
      for (const [re, pts] of spec.namesPenalty) if (re.test(pg)) score -= pts;
    }
    if (spec.requirePgType && c.pg_type !== spec.requirePgType) score = 0;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best ? { ...best, _score: bestScore } : null;
}

// Resolve "the right" columns for a typical sales / purchases table.
function resolveTableColumns(table, kind) {
  const isPurchase = kind === 'purchases';
  const cols = {};
  // Date — prefer DATE-typed *_actual columns (parsed) over TEXT date strings.
  cols.date = pickColumn(table, {
    role: 'date_actual',
    requirePgType: 'DATE',
    namesBoost: [
      [/c_date_actual$/, 6],          // invoice/document date
      [/invoice_date_actual$/, 6],
      [/bill_date_actual$/, 5],
      [/^date_actual$/, 4],
      [/timestamp_actual$/, 1]        // sync time — last resort
    ]
  }) || pickColumn(table, {
    role: 'date',
    namesBoost: [[/c_date$/, 4], [/invoice_date$/, 4]]
  });

  // Currency / amount — prefer "amount" / "total" / "with_gst_amount", penalise tax/component cols.
  cols.amount = pickColumn(table, {
    role: 'currency',
    namesBoost: [
      [/^amount$/, 8], [/^total$/, 8], [/^net_amount$/, 7],
      [/^grand_total$/, 7], [/with_gst_amount$/, 6],
      [/invoice_amount$/, 6], [/^total_amount$/, 6]
    ],
    namesPenalty: [
      [/cgst|sgst|igst|cess|tcs|tds|tax|round/, 10],
      [/discount|cd|^rate$|^price$|^credit_days$/, 6]
    ]
  });

  // Party / customer / supplier — entity column, name like party / customer / supplier.
  cols.party = pickColumn(table, {
    role: 'entity',
    namesBoost: isPurchase
      ? [[/party.*name|partyname/, 10], [/supplier.*name|supplier/, 8], [/vendor/, 7]]
      : [[/party.*name|partyname/, 10], [/customer/, 8], [/client/, 6]],
    namesPenalty: [
      [/sales_person|salesman|rep_name|transport|item_name|product_name/, 10]
    ]
  });

  // Item / product
  cols.item = pickColumn(table, {
    role: 'entity',
    namesBoost: [[/item.*name|itemname/, 10], [/product/, 8], [/sku/, 6]],
    namesPenalty: [[/party|customer|supplier|sales_person|transport/, 10]]
  });

  // Quantity
  cols.qty = pickColumn(table, {
    role: 'quantity',
    namesBoost: [[/^qty$|^quantity$/, 8]]
  });

  // Location (city / state)
  cols.city = pickColumn(table, {
    role: 'location',
    namesBoost: [[/^city$|town/, 8], [/state/, 6]]
  });

  // Voucher / id
  cols.id = pickColumn(table, {
    role: 'id',
    namesBoost: [[/voucher.*num/, 8], [/invoice_num/, 8], [/bill_num/, 6], [/vchno/, 6]]
  });

  return cols;
}

// ──────────────── 3. WIDGET CATALOG ────────────────
// Each widget is buildable iff its `requires(roles)` returns true.
// `build(roles, dr, prevDr)` returns { sql_main, sql_prev?, sql_spark?, transform(rows) → {...} }.
//
// `accent` = visual hue for KPI cards. Mapped to CSS var(--accent-X).
// `icon`   = lucide icon name to render in the KPI icon-box.
const WIDGET_CATALOG = [
  // ─── KPIs ───────────────────────────────────────────────
  {
    id: 'kpi.total_sales',
    kind: 'kpi',
    title: 'Total Sales',
    accent: 'emerald',
    icon: 'trending-up',
    priority: 100,
    requires: (r) => r.sales && r.sales.cols.amount && r.sales.cols.date,
    build(r, dr, prevDr) {
      const t = r.sales.table.pg_table;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      return {
        sql_main: `SELECT COALESCE(SUM(${a}::numeric), 0)::numeric AS v FROM ${t} ${whereDate(d, dr)}`,
        sql_prev: prevDr.from
          ? `SELECT COALESCE(SUM(${a}::numeric), 0)::numeric AS v FROM ${t} ${whereDate(d, prevDr)}`
          : null,
        sql_spark: `SELECT ${d}::date AS day, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
                    FROM ${t} ${whereDate(d, dr)} GROUP BY day ORDER BY day`,
        format: 'inr'
      };
    }
  },
  {
    id: 'kpi.total_purchases',
    kind: 'kpi',
    title: 'Total Purchases',
    accent: 'amber',
    icon: 'shopping-cart',
    priority: 90,
    requires: (r) => r.purchases && r.purchases.cols.amount && r.purchases.cols.date,
    build(r, dr, prevDr) {
      const t = r.purchases.table.pg_table;
      const a = r.purchases.cols.amount.pg_name;
      const d = r.purchases.cols.date.pg_name;
      return {
        sql_main: `SELECT COALESCE(SUM(${a}::numeric), 0)::numeric AS v FROM ${t} ${whereDate(d, dr)}`,
        sql_prev: prevDr.from
          ? `SELECT COALESCE(SUM(${a}::numeric), 0)::numeric AS v FROM ${t} ${whereDate(d, prevDr)}`
          : null,
        sql_spark: `SELECT ${d}::date AS day, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
                    FROM ${t} ${whereDate(d, dr)} GROUP BY day ORDER BY day`,
        format: 'inr'
      };
    }
  },
  {
    id: 'kpi.invoice_count',
    kind: 'kpi',
    title: 'Invoices',
    accent: 'indigo',
    icon: 'receipt',
    priority: 80,
    requires: (r) => r.sales && r.sales.cols.date,
    build(r, dr, prevDr) {
      const t = r.sales.table.pg_table;
      const d = r.sales.cols.date.pg_name;
      const id = r.sales.cols.id ? r.sales.cols.id.pg_name : null;
      const distinct = id ? `COUNT(DISTINCT ${id})` : 'COUNT(*)';
      return {
        sql_main: `SELECT ${distinct}::numeric AS v FROM ${t} ${whereDate(d, dr)}`,
        sql_prev: prevDr.from
          ? `SELECT ${distinct}::numeric AS v FROM ${t} ${whereDate(d, prevDr)}`
          : null,
        sql_spark: `SELECT ${d}::date AS day, ${distinct}::numeric AS v FROM ${t}
                    ${whereDate(d, dr)} GROUP BY day ORDER BY day`,
        format: 'num'
      };
    }
  },
  {
    id: 'kpi.unique_customers',
    kind: 'kpi',
    title: 'Active Customers',
    accent: 'violet',
    icon: 'users',
    priority: 70,
    requires: (r) => r.sales && r.sales.cols.party && r.sales.cols.date,
    build(r, dr, prevDr) {
      const t = r.sales.table.pg_table;
      const p = r.sales.cols.party.pg_name;
      const d = r.sales.cols.date.pg_name;
      return {
        sql_main: `SELECT COUNT(DISTINCT ${p})::numeric AS v FROM ${t} ${whereDate(d, dr)} AND ${p} IS NOT NULL`,
        sql_prev: prevDr.from
          ? `SELECT COUNT(DISTINCT ${p})::numeric AS v FROM ${t} ${whereDate(d, prevDr)} AND ${p} IS NOT NULL`
          : null,
        sql_spark: `SELECT ${d}::date AS day, COUNT(DISTINCT ${p})::numeric AS v FROM ${t}
                    ${whereDate(d, dr)} AND ${p} IS NOT NULL GROUP BY day ORDER BY day`,
        format: 'num'
      };
    }
  },
  {
    id: 'kpi.avg_invoice',
    kind: 'kpi',
    title: 'Avg Invoice Value',
    accent: 'cyan',
    icon: 'calculator',
    priority: 60,
    requires: (r) => r.sales && r.sales.cols.amount && r.sales.cols.date && r.sales.cols.id,
    build(r, dr, prevDr) {
      const t = r.sales.table.pg_table;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      const id = r.sales.cols.id.pg_name;
      const sql = (range) => `
        SELECT COALESCE(SUM(${a}::numeric), 0) / NULLIF(COUNT(DISTINCT ${id}), 0) AS v
        FROM ${t} ${whereDate(d, range)}`;
      return { sql_main: sql(dr), sql_prev: prevDr.from ? sql(prevDr) : null, format: 'inr' };
    }
  },
  {
    id: 'kpi.total_outstanding',
    kind: 'kpi',
    title: 'Outstanding',
    accent: 'rose',
    icon: 'hourglass',
    priority: 95,
    requires: (r) => r.outstanding && r.outstanding.cols.amount,
    build(r) {
      const t = r.outstanding.table.pg_table;
      const a = r.outstanding.cols.amount.pg_name;
      return {
        sql_main: `SELECT COALESCE(SUM(${a}::numeric), 0)::numeric AS v FROM ${t}`,
        format: 'inr'
      };
    }
  },

  // ─── CHARTS ─────────────────────────────────────────────
  {
    id: 'chart.sales_trend',
    kind: 'chart',
    chartKind: 'line',
    title: 'Sales Trend',
    priority: 100,
    requires: (r) => r.sales && r.sales.cols.amount && r.sales.cols.date,
    build(r, dr) {
      const t = r.sales.table.pg_table;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      return {
        sql_main: `
          SELECT ${d}::date AS day, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
          FROM ${t} ${whereDate(d, dr)}
          GROUP BY day ORDER BY day`,
        format: 'inr',
        transform(rows) {
          return {
            labels: rows.map(r => r.day),
            data:   rows.map(r => Number(r.v) || 0)
          };
        }
      };
    }
  },
  {
    id: 'chart.purchases_trend',
    kind: 'chart',
    chartKind: 'line',
    title: 'Purchases Trend',
    priority: 80,
    requires: (r) => r.purchases && r.purchases.cols.amount && r.purchases.cols.date && !r.sales,
    build(r, dr) {
      const t = r.purchases.table.pg_table;
      const a = r.purchases.cols.amount.pg_name;
      const d = r.purchases.cols.date.pg_name;
      return {
        sql_main: `
          SELECT ${d}::date AS day, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
          FROM ${t} ${whereDate(d, dr)}
          GROUP BY day ORDER BY day`,
        format: 'inr',
        transform(rows) {
          return { labels: rows.map(r => r.day), data: rows.map(r => Number(r.v) || 0) };
        }
      };
    }
  },
  {
    id: 'chart.top_parties',
    kind: 'chart',
    chartKind: 'donut',
    title: 'Top Customers',
    priority: 90,
    requires: (r) => r.sales && r.sales.cols.party && r.sales.cols.amount && r.sales.cols.date,
    build(r, dr) {
      const t = r.sales.table.pg_table;
      const p = r.sales.cols.party.pg_name;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      return {
        sql_main: `
          SELECT ${p} AS label, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
          FROM ${t} ${whereDate(d, dr)} AND ${p} IS NOT NULL
          GROUP BY ${p} ORDER BY v DESC NULLS LAST LIMIT 6`,
        format: 'inr',
        transform(rows) {
          return {
            labels: rows.map(r => r.label || 'Unknown'),
            data:   rows.map(r => Number(r.v) || 0)
          };
        }
      };
    }
  },
  {
    id: 'chart.top_items',
    kind: 'chart',
    chartKind: 'bar',
    title: 'Top Items',
    priority: 85,
    requires: (r) => r.sales && r.sales.cols.item && r.sales.cols.amount && r.sales.cols.date,
    build(r, dr) {
      const t = r.sales.table.pg_table;
      const i = r.sales.cols.item.pg_name;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      return {
        sql_main: `
          SELECT ${i} AS label, COALESCE(SUM(${a}::numeric), 0)::numeric AS v
          FROM ${t} ${whereDate(d, dr)} AND ${i} IS NOT NULL
          GROUP BY ${i} ORDER BY v DESC NULLS LAST LIMIT 8`,
        format: 'inr',
        transform(rows) {
          return {
            labels: rows.map(r => truncate(r.label || 'Unknown', 24)),
            data:   rows.map(r => Number(r.v) || 0)
          };
        }
      };
    }
  },

  // ─── TABLES ─────────────────────────────────────────────
  {
    id: 'table.recent_invoices',
    kind: 'table',
    title: 'Recent Invoices',
    priority: 90,
    requires: (r) => r.sales && r.sales.cols.date && r.sales.cols.amount,
    build(r, dr) {
      const t   = r.sales.table.pg_table;
      const d   = r.sales.cols.date.pg_name;
      const a   = r.sales.cols.amount.pg_name;
      const p   = r.sales.cols.party ? r.sales.cols.party.pg_name : null;
      const id  = r.sales.cols.id    ? r.sales.cols.id.pg_name    : null;
      const cols = [`${d}::date AS day`, `${a}::numeric AS amount`];
      if (p)  cols.push(`${p} AS party`);
      if (id) cols.push(`${id} AS voucher`);
      return {
        sql_main: `SELECT ${cols.join(', ')} FROM ${t} WHERE ${d} IS NOT NULL ORDER BY ${d} DESC LIMIT 10`,
        format: 'inr',
        meta: { has_party: !!p, has_voucher: !!id }
      };
    }
  },
  {
    id: 'table.top_customers',
    kind: 'table',
    title: 'Top Customers',
    priority: 80,
    requires: (r) => r.sales && r.sales.cols.party && r.sales.cols.amount && r.sales.cols.date,
    build(r, dr) {
      const t = r.sales.table.pg_table;
      const p = r.sales.cols.party.pg_name;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      return {
        sql_main: `
          SELECT ${p} AS party, COALESCE(SUM(${a}::numeric), 0)::numeric AS total, COUNT(*)::int AS invoices
          FROM ${t} ${whereDate(d, dr)} AND ${p} IS NOT NULL
          GROUP BY ${p} ORDER BY total DESC NULLS LAST LIMIT 8`,
        format: 'inr'
      };
    }
  },
  {
    id: 'table.top_items',
    kind: 'table',
    title: 'Top Items',
    priority: 70,
    requires: (r) => r.sales && r.sales.cols.item && r.sales.cols.amount && r.sales.cols.date,
    build(r, dr) {
      const t = r.sales.table.pg_table;
      const i = r.sales.cols.item.pg_name;
      const a = r.sales.cols.amount.pg_name;
      const d = r.sales.cols.date.pg_name;
      const q = r.sales.cols.qty ? r.sales.cols.qty.pg_name : null;
      const sumQ = q ? `, COALESCE(SUM(${q}::numeric), 0)::numeric AS qty` : '';
      return {
        sql_main: `
          SELECT ${i} AS item, COALESCE(SUM(${a}::numeric), 0)::numeric AS total${sumQ}
          FROM ${t} ${whereDate(d, dr)} AND ${i} IS NOT NULL
          GROUP BY ${i} ORDER BY total DESC NULLS LAST LIMIT 8`,
        format: 'inr',
        meta: { has_qty: !!q }
      };
    }
  }
];

// ──────────────── 4. SQL HELPERS ────────────────
function whereDate(col, dr) {
  if (!dr || !dr.from) return 'WHERE 1=1';
  return `WHERE ${col} BETWEEN '${dr.from}' AND '${dr.to}'`;
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ──────────────── 5. ENGINE CORE ────────────────
async function buildDashboard(supabase, tenantId, opts = {}) {
  // 1. Load tenant
  const { data: tenant, error: tErr } = await supabase
    .from('tenants')
    .select('id, name, phone, tables_metadata, schema_json')
    .eq('id', tenantId)
    .maybeSingle();
  if (tErr || !tenant) {
    return { error: 'Tenant not found', widgets: [] };
  }

  const tablesMeta = Array.isArray(tenant.tables_metadata) ? tenant.tables_metadata : [];
  if (!tablesMeta.length) {
    return {
      tenant: { id: tenant.id, name: tenant.name },
      widgets: [],
      empty: true,
      message: 'No data tables yet. Sync your sheet to populate the dashboard.'
    };
  }

  // 2. Classify and resolve columns per table
  const roles = {};   // role → { table, cols }
  for (const meta of tablesMeta) {
    const kind = classifyTable(meta);
    if (kind === 'other') continue;
    const cols = resolveTableColumns(meta, kind);
    // Keep first / largest table per role (by row_count)
    if (!roles[kind] || (meta.row_count || 0) > (roles[kind].table.row_count || 0)) {
      roles[kind] = { table: meta, cols };
    }
  }

  // 3. Compute date ranges
  const dr = computeDateRange(opts.range || 'month');
  const prevDr = previousRange(dr);

  // 4. Pick widgets that can be built
  const candidates = WIDGET_CATALOG
    .filter(w => safeRequires(w, roles))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // KPI cap (4 most relevant) — charts/tables uncapped
  const kpis  = candidates.filter(w => w.kind === 'kpi').slice(0, 4);
  const charts = candidates.filter(w => w.kind === 'chart');
  const tables = candidates.filter(w => w.kind === 'table');
  const widgets = [...kpis, ...charts, ...tables];

  // 5. Run all widgets in parallel
  const results = await Promise.all(widgets.map(w => runWidget(supabase, w, roles, dr, prevDr)));

  return {
    tenant: { id: tenant.id, name: tenant.name },
    range: dr.label,
    date_range: dr,
    prev_range: prevDr,
    detected_roles: Object.keys(roles),
    widgets: widgets.map((w, i) => ({
      id:        w.id,
      kind:      w.kind,
      chartKind: w.chartKind || null,
      title:     w.title,
      accent:    w.accent || null,
      icon:      w.icon || null,
      ok:        results[i].ok,
      data:      results[i].data,
      error:     results[i].error || null
    })),
    generated_at: new Date().toISOString()
  };
}

function safeRequires(widget, roles) {
  try { return !!widget.requires(roles); } catch { return false; }
}

async function runWidget(supabase, widget, roles, dr, prevDr) {
  try {
    const spec = widget.build(roles, dr, prevDr);
    const { data: mainRows, error: mainErr } = await supabase.rpc('execute_sql', { query: spec.sql_main });
    if (mainErr) throw new Error(mainErr.message);

    let prevRows = null;
    if (spec.sql_prev) {
      const { data, error } = await supabase.rpc('execute_sql', { query: spec.sql_prev });
      if (!error) prevRows = data;
    }

    let sparkRows = null;
    if (spec.sql_spark) {
      const { data, error } = await supabase.rpc('execute_sql', { query: spec.sql_spark });
      if (!error) sparkRows = data;
    }

    if (widget.kind === 'kpi') {
      const value = Number(mainRows?.[0]?.v ?? 0);
      const prev  = prevRows ? Number(prevRows?.[0]?.v ?? 0) : null;
      const delta_pct = (prev !== null && prev > 0)
        ? ((value - prev) / prev) * 100
        : null;

      // Build sparkline + parallel date labels.
      // Pad every day in the range with zero so the chart shows true daily
      // rhythm instead of skipping gap-days and producing a misleading line.
      let spark = null;
      let spark_dates = null;
      if (sparkRows && dr && dr.from && dr.to) {
        const map = new Map();
        for (const r of sparkRows) {
          const key = String(r.day || '').slice(0, 10);
          if (key) map.set(key, Number(r.v) || 0);
        }
        spark = [];
        spark_dates = [];
        const cur = new Date(dr.from + 'T00:00:00Z');
        const end = new Date(dr.to + 'T00:00:00Z');
        let safety = 400;   // upper bound — never run away
        while (cur <= end && safety-- > 0) {
          const key = cur.toISOString().slice(0, 10);
          spark_dates.push(key);
          spark.push(map.has(key) ? map.get(key) : 0);
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      } else if (sparkRows) {
        // No date range (e.g. range=all) — fall back to raw rows in order
        spark       = sparkRows.map(r => Number(r.v) || 0);
        spark_dates = sparkRows.map(r => String(r.day || '').slice(0, 10));
      }

      return {
        ok: true,
        data: {
          value, prev, delta_pct,
          format: spec.format || 'num',
          sparkline: spark,
          sparkline_dates: spark_dates,
          anomaly: detectAnomaly(spark, { threshold: 2, minPoints: 7 })
        }
      };
    }

    if (widget.kind === 'chart') {
      const transformed = spec.transform ? spec.transform(mainRows) : { labels: [], data: [] };
      return { ok: true, data: { ...transformed, format: spec.format || 'num' } };
    }

    if (widget.kind === 'table') {
      return { ok: true, data: { rows: mainRows || [], format: spec.format || 'num', meta: spec.meta || {} } };
    }

    return { ok: true, data: { rows: mainRows } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  buildDashboard,
  // exposed for testing / debugging
  _internals: { computeDateRange, previousRange, classifyTable, resolveTableColumns, pickColumn, WIDGET_CATALOG }
};
