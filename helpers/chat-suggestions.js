// helpers/chat-suggestions.js
// ────────────────────────────────────────────────────────────────────────────
// Phase 20 Sprint 3 — ChatOS suggestion chips
//
// Pure function: takes a tenant's `tables_metadata` array (same shape used by
// dashboard-engine.js) and returns a small list of contextual chip prompts
// the user can tap to seed a chat query. The function is schema-aware — it
// picks chips for ONLY the table kinds the tenant actually has (sales,
// purchases, outstanding, stock, ledger, expenses, leads).
//
// Public API:
//   buildChatSuggestions(tablesMetadata, opts) → { roles: string[], chips: [{label,prompt,icon,kind}] }
//
// Notes:
//   • Defaults to a friendly fallback set when metadata is missing or empty.
//   • Caps at `opts.limit` (default 6) to keep UI clean.
//   • All prompts are in plain English (Phase 16 — English-only output).
//   • Stable ordering — sales chips first, then purchases, then "money owed",
//     then stock, then ledger / expenses / leads. UI stagger matches array order.
// ────────────────────────────────────────────────────────────────────────────
'use strict';

// ── 1. Detect the role of a single table (mirror of dashboard-engine's classifyTable) ──
function classifyTable(meta) {
  if (!meta) return 'other';
  const name = String(meta.source_name || meta.pg_table || '').toLowerCase();
  if (/(^|_)sale|invoic|billing/.test(name))                  return 'sales';
  if (/(^|_)purchas|buy|vendor_inv/.test(name))               return 'purchases';
  if (/outstand|pending|receivab|debt|due|aging/.test(name))  return 'outstanding';
  if (/payment|collect|remit/.test(name))                     return 'payments';
  if (/stock|inventor/.test(name))                            return 'stock';
  if (/ledger|account/.test(name))                            return 'ledger';
  if (/expens|cost/.test(name))                               return 'expenses';
  if (/lead|prospect/.test(name))                             return 'leads';
  if (/checklist|task|delegation/.test(name))                 return 'tasks';

  // Heuristic fallback — date + currency + entity ≈ sales-shape
  const cols = meta.columns || [];
  const has = (pred) => cols.some(pred);
  const hasDate     = has((c) => /date/.test(c.role || ''));
  const hasCurrency = has((c) => c.role === 'currency');
  const hasEntity   = has((c) => c.role === 'entity');
  if (hasDate && hasCurrency && hasEntity) return 'sales';
  return 'other';
}

// ── 2. Chip catalogues — keyed by detected role ───────────────────────────
// Each chip: { label, prompt, icon, kind }
//   label  — short text shown on the chip
//   prompt — full message that gets sent on click (English-only)
//   icon   — lucide icon name (frontend will render via data-lucide)
//   kind   — drives accent colour grouping in CSS (.chip[data-kind="sales"])
const CHIP_CATALOG = {
  sales: [
    { label: 'Total sales this month',       prompt: 'Total sales this month',                              icon: 'trending-up',  kind: 'sales' },
    { label: 'Top 5 customers',              prompt: 'Show me top 5 customers by total sales',              icon: 'users',        kind: 'sales' },
    { label: 'Sales by item',                prompt: 'Show me sales by item, top 10',                       icon: 'package',      kind: 'sales' },
    { label: 'Sales trend last 30 days',     prompt: 'Show me a sales trend chart for the last 30 days',    icon: 'line-chart',   kind: 'sales' },
    { label: 'Sales by city',                prompt: 'Show me sales by city, top 8',                        icon: 'map-pin',      kind: 'sales' },
    { label: 'Today\u2019s sales',           prompt: 'How much did we sell today?',                         icon: 'calendar-clock', kind: 'sales' },
  ],
  purchases: [
    { label: 'Total purchases this month',   prompt: 'Total purchases this month',                          icon: 'shopping-cart',kind: 'purchases' },
    { label: 'Top suppliers',                prompt: 'Show me top 5 suppliers by purchase value',           icon: 'truck',        kind: 'purchases' },
    { label: 'Purchases by item',            prompt: 'Show me purchases by item, top 10',                   icon: 'boxes',        kind: 'purchases' },
    { label: 'Purchase trend',               prompt: 'Show me a purchase trend chart for the last 30 days', icon: 'activity',     kind: 'purchases' },
  ],
  outstanding: [
    { label: 'Outstanding aging',            prompt: 'Show me an outstanding aging report',                 icon: 'hourglass',    kind: 'outstanding' },
    { label: 'Pending > 30 days',            prompt: 'Which customers are pending payment for more than 30 days?', icon: 'alert-triangle', kind: 'outstanding' },
    { label: 'Top defaulters',               prompt: 'Show me the top 5 customers with the highest outstanding amount', icon: 'user-x', kind: 'outstanding' },
  ],
  stock: [
    { label: 'Low stock items',              prompt: 'Show me items that are low in stock',                 icon: 'package-x',    kind: 'stock' },
    { label: 'Stock value',                  prompt: 'What is the total value of current stock?',           icon: 'banknote',     kind: 'stock' },
    { label: 'Slow moving items',            prompt: 'Show me slow moving items by stock turnover',         icon: 'snowflake',    kind: 'stock' },
  ],
  ledger: [
    { label: 'Open ledger for…',             prompt: 'Open ledger for ',                                    icon: 'book-open',    kind: 'ledger' },
    { label: 'Ledger balance summary',       prompt: 'Show me a ledger balance summary',                    icon: 'scale',        kind: 'ledger' },
  ],
  expenses: [
    { label: 'Total expenses this month',    prompt: 'Total expenses this month',                           icon: 'receipt',      kind: 'expenses' },
    { label: 'Expense by category',          prompt: 'Show me expenses by category',                        icon: 'pie-chart',    kind: 'expenses' },
  ],
  payments: [
    { label: 'Recent payments',              prompt: 'Show me the most recent payments received',           icon: 'wallet',       kind: 'payments' },
  ],
  leads: [
    { label: 'New leads this week',          prompt: 'Show me new leads added this week',                   icon: 'user-plus',    kind: 'leads' },
    { label: 'Leads by status',              prompt: 'Show me leads grouped by status',                     icon: 'list-checks',  kind: 'leads' },
  ],
  tasks: [
    { label: 'Pending tasks',                prompt: 'Show me my pending tasks',                            icon: 'check-square', kind: 'tasks' },
  ],
};

// Generic fallback when we can't detect anything useful.
const GENERIC_CHIPS = [
  { label: 'Show me a quick summary',      prompt: 'Give me a quick summary of my data',                   icon: 'sparkles',     kind: 'generic' },
  { label: 'What can you do?',             prompt: 'What kinds of questions can I ask you?',               icon: 'help-circle',  kind: 'generic' },
  { label: 'Sync my latest data',          prompt: 'Sync my latest data',                                  icon: 'refresh-cw',   kind: 'generic' },
];

// Stable ordering for output — most-useful first.
const ROLE_ORDER = [
  'sales',
  'purchases',
  'outstanding',
  'stock',
  'ledger',
  'expenses',
  'payments',
  'leads',
  'tasks',
];

// ── 3. Main builder ──────────────────────────────────────────────────────
function buildChatSuggestions(tablesMetadata, opts = {}) {
  const limit = Math.max(2, Math.min(parseInt(opts.limit, 10) || 6, 8));

  if (!Array.isArray(tablesMetadata) || tablesMetadata.length === 0) {
    return { roles: [], chips: GENERIC_CHIPS.slice(0, limit) };
  }

  // Detect every role the tenant has
  const detected = new Set();
  for (const tab of tablesMetadata) {
    detected.add(classifyTable(tab));
  }
  detected.delete('other');

  // Build chip pool in priority order
  const pool = [];
  for (const role of ROLE_ORDER) {
    if (!detected.has(role)) continue;
    const chips = CHIP_CATALOG[role] || [];
    for (const c of chips) pool.push(c);
  }

  // Nothing matched (e.g. only 'other' tables) → generic
  if (pool.length === 0) {
    return { roles: [], chips: GENERIC_CHIPS.slice(0, limit) };
  }

  // Round-robin selection so the first row always shows variety.
  // Group by `kind`, then take one from each kind in turn until we hit `limit`.
  const buckets = {};
  for (const c of pool) {
    if (!buckets[c.kind]) buckets[c.kind] = [];
    buckets[c.kind].push(c);
  }
  const kinds = Object.keys(buckets);
  const result = [];
  let idx = 0;
  while (result.length < limit) {
    let added = false;
    for (const k of kinds) {
      if (buckets[k][idx]) {
        result.push(buckets[k][idx]);
        added = true;
        if (result.length >= limit) break;
      }
    }
    if (!added) break;
    idx++;
  }

  return {
    roles: Array.from(detected),
    chips: result,
  };
}

module.exports = { buildChatSuggestions, classifyTable, CHIP_CATALOG };
