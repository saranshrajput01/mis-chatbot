/**
 * Unit tests for helpers/dashboard-engine.js _internals
 * Tests pure helpers without hitting Supabase: range computation, table
 * classification, column scoring, role resolution.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { _internals } = require('../../helpers/dashboard-engine');
const { computeDateRange, previousRange, classifyTable, pickColumn, resolveTableColumns, WIDGET_CATALOG } = _internals;

// ─────────────────────── computeDateRange ───────────────────────
describe('computeDateRange', () => {
  test('today', () => {
    const r = computeDateRange('today');
    assert.equal(r.from, r.to, 'from === to for today');
    assert.equal(r.label, 'today');
  });
  test('week (last 7 days)', () => {
    const r = computeDateRange('week');
    assert.ok(r.from);
    assert.ok(r.to);
    const from = new Date(r.from), to = new Date(r.to);
    const days = Math.round((to - from) / 86400000);
    assert.equal(days, 6);
  });
  test('month (last 30 days)', () => {
    const r = computeDateRange('month');
    const days = Math.round((new Date(r.to) - new Date(r.from)) / 86400000);
    assert.equal(days, 29);
  });
  test('quarter (last 90 days)', () => {
    const r = computeDateRange('quarter');
    const days = Math.round((new Date(r.to) - new Date(r.from)) / 86400000);
    assert.equal(days, 89);
  });
  test('year (last 365 days)', () => {
    const r = computeDateRange('year');
    const days = Math.round((new Date(r.to) - new Date(r.from)) / 86400000);
    assert.equal(days, 364);
  });
  test('all returns nulls + label', () => {
    const r = computeDateRange('all');
    assert.equal(r.from, null);
    assert.equal(r.to, null);
    assert.equal(r.label, 'All-time');
  });
  test('default falls back to month', () => {
    const r = computeDateRange();
    const days = Math.round((new Date(r.to) - new Date(r.from)) / 86400000);
    assert.equal(days, 29);
  });
  test('YYYY-MM-DD format', () => {
    const r = computeDateRange('week');
    assert.match(r.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.to,   /^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─────────────────────── previousRange ───────────────────────
describe('previousRange', () => {
  test('produces an immediately-prior window of equal length', () => {
    const dr = { from: '2026-05-01', to: '2026-05-30' };
    const prev = previousRange(dr);
    assert.equal(prev.to, '2026-04-30');
    assert.equal(prev.from, '2026-04-01');
  });
  test('all-time range → nulls', () => {
    const prev = previousRange({ from: null, to: null });
    assert.equal(prev.from, null);
    assert.equal(prev.to, null);
  });
  test('single-day range → previous single day', () => {
    const dr = { from: '2026-05-26', to: '2026-05-26' };
    const prev = previousRange(dr);
    assert.equal(prev.from, '2026-05-25');
    assert.equal(prev.to,   '2026-05-25');
  });
});

// ─────────────────────── classifyTable ───────────────────────
describe('classifyTable', () => {
  test('sales tables', () => {
    assert.equal(classifyTable({ source_name: 'sales' }),       'sales');
    assert.equal(classifyTable({ source_name: 'invoices' }),    'sales');
    assert.equal(classifyTable({ source_name: 'tenant_x_billing' }), 'sales');
  });
  test('purchases tables', () => {
    assert.equal(classifyTable({ source_name: 'purchases' }),   'purchases');
    assert.equal(classifyTable({ source_name: 'vendor_inv' }),  'purchases');
  });
  test('outstanding/payments/stock/ledger', () => {
    assert.equal(classifyTable({ source_name: 'outstanding' }), 'outstanding');
    assert.equal(classifyTable({ source_name: 'receivables' }), 'outstanding');
    assert.equal(classifyTable({ source_name: 'payments' }),    'payments');
    assert.equal(classifyTable({ source_name: 'stock' }),       'stock');
    assert.equal(classifyTable({ source_name: 'ledger' }),      'ledger');
    assert.equal(classifyTable({ source_name: 'expenses' }),    'expenses');
    assert.equal(classifyTable({ source_name: 'leads' }),       'leads');
  });
  test('unknown name with sales-like columns → heuristic sales', () => {
    const meta = {
      source_name: 'random_table',
      columns: [{ role: 'date_actual' }, { role: 'currency' }, { role: 'entity' }],
    };
    assert.equal(classifyTable(meta), 'sales');
  });
  test('unknown name with no telltale columns → other', () => {
    assert.equal(classifyTable({ source_name: 'random_xyz' }), 'other');
    assert.equal(classifyTable({ source_name: 'random_xyz', columns: [] }), 'other');
  });
});

// ─────────────────────── pickColumn ───────────────────────
describe('pickColumn', () => {
  const sampleTable = {
    columns: [
      { pg_name: 'invoice_no',   role: 'id',       pg_type: 'TEXT' },
      { pg_name: 'amount',       role: 'currency', pg_type: 'NUMERIC' },
      { pg_name: 'cgst_amount',  role: 'currency', pg_type: 'NUMERIC' },
      { pg_name: 'customer',     role: 'entity',   pg_type: 'TEXT' },
      { pg_name: 'sales_person', role: 'entity',   pg_type: 'TEXT' },
    ],
  };

  test('returns null if nothing scores', () => {
    const r = pickColumn({ columns: [{ pg_name: 'random' }] }, { role: 'currency' });
    assert.equal(r, null);
  });

  test('picks role-matching column', () => {
    const r = pickColumn(sampleTable, { role: 'currency' });
    assert.ok(r);
    assert.equal(r.role, 'currency');
  });

  test('boosts based on name pattern', () => {
    const r = pickColumn(sampleTable, {
      role: 'currency',
      namesBoost: [[/^amount$/, 8]],
    });
    assert.equal(r.pg_name, 'amount');
  });

  test('penalty disqualifies tax columns', () => {
    const r = pickColumn(sampleTable, {
      role: 'currency',
      namesBoost: [[/^amount$/, 8]],
      namesPenalty: [[/cgst|sgst|igst/, 10]],
    });
    assert.equal(r.pg_name, 'amount');
  });

  test('requirePgType filters out wrong types', () => {
    const r = pickColumn(sampleTable, {
      role: 'currency',
      requirePgType: 'TEXT',
    });
    assert.equal(r, null);
  });

  test('boost on namesBoost should beat plain role match', () => {
    const r = pickColumn(sampleTable, {
      role: 'entity',
      namesBoost: [[/customer/, 10]],
    });
    assert.equal(r.pg_name, 'customer');
  });
});

// ─────────────────────── resolveTableColumns ───────────────────────
describe('resolveTableColumns', () => {
  const salesTable = {
    columns: [
      { pg_name: 'c_date_actual',    role: 'date_actual', pg_type: 'DATE' },
      { pg_name: 'c_date',           role: 'date',        pg_type: 'TEXT' },
      { pg_name: 'amount',           role: 'currency',    pg_type: 'NUMERIC' },
      { pg_name: 'cgst_amount',      role: 'currency',    pg_type: 'NUMERIC' },
      { pg_name: 'customer',         role: 'entity',      pg_type: 'TEXT' },
      { pg_name: 'sales_person',     role: 'entity',      pg_type: 'TEXT' },
      { pg_name: 'item_name',        role: 'entity',      pg_type: 'TEXT' },
      { pg_name: 'qty',              role: 'quantity',    pg_type: 'NUMERIC' },
      { pg_name: 'city',             role: 'location',    pg_type: 'TEXT' },
    ],
  };

  test('picks DATE-typed _actual column for date', () => {
    const r = resolveTableColumns(salesTable, 'sales');
    assert.equal(r.date.pg_name, 'c_date_actual');
  });

  test('picks "amount" not tax columns for amount', () => {
    const r = resolveTableColumns(salesTable, 'sales');
    assert.equal(r.amount.pg_name, 'amount');
  });

  test('prefers "customer" over "sales_person" for party in sales', () => {
    const r = resolveTableColumns(salesTable, 'sales');
    assert.equal(r.party.pg_name, 'customer');
  });

  test('picks item_name for item', () => {
    const r = resolveTableColumns(salesTable, 'sales');
    assert.equal(r.item.pg_name, 'item_name');
  });

  test('picks qty for quantity', () => {
    const r = resolveTableColumns(salesTable, 'sales');
    assert.equal(r.qty.pg_name, 'qty');
  });

  test('picks city for location', () => {
    const r = resolveTableColumns(salesTable, 'sales');
    assert.equal(r.city.pg_name, 'city');
  });

  test('returns nulls for missing roles', () => {
    const minimal = { columns: [{ pg_name: 'foo', role: 'text' }] };
    const r = resolveTableColumns(minimal, 'sales');
    assert.equal(r.date,   null);
    assert.equal(r.amount, null);
    assert.equal(r.party,  null);
  });

  test('purchases mode prefers supplier over customer in name boosts', () => {
    const purchaseTable = {
      columns: [
        { pg_name: 'supplier_name',  role: 'entity', pg_type: 'TEXT' },
        { pg_name: 'customer',       role: 'entity', pg_type: 'TEXT' },
      ],
    };
    const r = resolveTableColumns(purchaseTable, 'purchases');
    assert.equal(r.party.pg_name, 'supplier_name');
  });
});

// ─────────────────────── WIDGET_CATALOG sanity ───────────────────────
describe('WIDGET_CATALOG', () => {
  test('is a non-empty array', () => {
    assert.ok(Array.isArray(WIDGET_CATALOG));
    assert.ok(WIDGET_CATALOG.length > 0);
  });
  test('every widget has id, kind, title', () => {
    WIDGET_CATALOG.forEach(w => {
      assert.ok(w.id,    `widget ${JSON.stringify(w).slice(0,40)} has id`);
      assert.ok(w.kind,  `widget ${w.id} has kind`);
      assert.ok(w.title, `widget ${w.id} has title`);
    });
  });
  test('valid kind values', () => {
    const validKinds = ['kpi', 'chart', 'table'];
    WIDGET_CATALOG.forEach(w => {
      assert.ok(validKinds.includes(w.kind), `${w.id} kind=${w.kind} is one of ${validKinds}`);
    });
  });
});
