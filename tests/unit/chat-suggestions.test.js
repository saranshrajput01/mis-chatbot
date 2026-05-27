/**
 * Unit tests for helpers/chat-suggestions.js
 * Pure schema-aware chip generator. Tests cover classification, role
 * matching, fallback chips, limit cap, round-robin variety.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { buildChatSuggestions, classifyTable, CHIP_CATALOG } =
  require('../../helpers/chat-suggestions');

// ─────────────────────── classifyTable ───────────────────────
describe('classifyTable', () => {
  test('sales tables', () => {
    assert.equal(classifyTable({ source_name: 'sales' }),         'sales');
    assert.equal(classifyTable({ source_name: 'tenant_x_sales' }),'sales');
    assert.equal(classifyTable({ source_name: 'invoices' }),      'sales');
    assert.equal(classifyTable({ source_name: 'monthly_billing' }),'sales');
  });
  test('purchases tables', () => {
    assert.equal(classifyTable({ source_name: 'purchases' }),     'purchases');
    assert.equal(classifyTable({ source_name: 'tenant_x_purchases' }), 'purchases');
    assert.equal(classifyTable({ source_name: 'vendor_invoices' }),    'purchases');
  });
  test('outstanding tables', () => {
    assert.equal(classifyTable({ source_name: 'outstanding' }),   'outstanding');
    assert.equal(classifyTable({ source_name: 'pending_dues' }),  'outstanding');
    assert.equal(classifyTable({ source_name: 'receivables' }),   'outstanding');
  });
  test('stock + ledger + others', () => {
    assert.equal(classifyTable({ source_name: 'stock' }),         'stock');
    assert.equal(classifyTable({ source_name: 'inventory' }),     'stock');
    assert.equal(classifyTable({ source_name: 'ledger' }),        'ledger');
    assert.equal(classifyTable({ source_name: 'expenses' }),      'expenses');
    assert.equal(classifyTable({ source_name: 'leads' }),         'leads');
  });
  test('payments / tasks tables', () => {
    assert.equal(classifyTable({ source_name: 'payments' }),      'payments');
    assert.equal(classifyTable({ source_name: 'task_list' }),     'tasks');
    assert.equal(classifyTable({ source_name: 'checklist' }),     'tasks');
  });
  test('null/missing meta → other', () => {
    assert.equal(classifyTable(null),       'other');
    assert.equal(classifyTable({}),         'other');
    assert.equal(classifyTable({ source_name: 'random_thing' }), 'other');
  });
  test('heuristic fallback — date+currency+entity = sales', () => {
    const meta = {
      source_name: 'random_xyz',
      columns: [
        { role: 'date_actual' },
        { role: 'currency'    },
        { role: 'entity'      },
      ],
    };
    assert.equal(classifyTable(meta), 'sales');
  });
  test('uses pg_table when source_name missing', () => {
    assert.equal(classifyTable({ pg_table: 'tenant_xyz_sales' }), 'sales');
  });
});

// ─────────────────────── buildChatSuggestions ───────────────────────
describe('buildChatSuggestions: empty/missing', () => {
  test('null input → generic chips', () => {
    const r = buildChatSuggestions(null);
    assert.deepEqual(r.roles, []);
    assert.ok(r.chips.length > 0);
    assert.equal(r.chips[0].kind, 'generic');
  });
  test('empty array → generic chips', () => {
    const r = buildChatSuggestions([]);
    assert.deepEqual(r.roles, []);
    assert.equal(r.chips[0].kind, 'generic');
  });
  test('only "other" tables → generic chips', () => {
    const r = buildChatSuggestions([{ source_name: 'random_table' }]);
    assert.equal(r.chips[0].kind, 'generic');
  });
});

describe('buildChatSuggestions: tenant with sales', () => {
  test('sales-only tenant returns sales chips', () => {
    const r = buildChatSuggestions([{ source_name: 'sales' }]);
    assert.ok(r.roles.includes('sales'));
    assert.ok(r.chips.length > 0);
    r.chips.forEach(c => assert.equal(c.kind, 'sales'));
  });
});

describe('buildChatSuggestions: multi-role tenant', () => {
  test('sales + purchases returns mix (round-robin)', () => {
    const r = buildChatSuggestions([
      { source_name: 'sales' },
      { source_name: 'purchases' },
    ], { limit: 6 });
    assert.ok(r.roles.includes('sales'));
    assert.ok(r.roles.includes('purchases'));
    const kinds = new Set(r.chips.map(c => c.kind));
    assert.ok(kinds.has('sales'));
    assert.ok(kinds.has('purchases'));
  });
  test('sales + outstanding + stock returns mix', () => {
    const r = buildChatSuggestions([
      { source_name: 'sales' },
      { source_name: 'outstanding' },
      { source_name: 'stock' },
    ], { limit: 6 });
    const kinds = new Set(r.chips.map(c => c.kind));
    assert.ok(kinds.size >= 3);
  });
});

describe('buildChatSuggestions: limit', () => {
  test('respects custom limit', () => {
    const r = buildChatSuggestions([{ source_name: 'sales' }], { limit: 3 });
    assert.equal(r.chips.length, 3);
  });
  test('clamps limit to 8 max', () => {
    const r = buildChatSuggestions([{ source_name: 'sales' }], { limit: 99 });
    assert.ok(r.chips.length <= 8);
  });
  test('clamps limit to 2 min', () => {
    const r = buildChatSuggestions([{ source_name: 'sales' }], { limit: 0 });
    assert.ok(r.chips.length >= 2);
  });
  test('default limit is 6', () => {
    const r = buildChatSuggestions([
      { source_name: 'sales' },
      { source_name: 'purchases' },
    ]);
    assert.ok(r.chips.length <= 6);
  });
});

describe('buildChatSuggestions: chip shape', () => {
  test('each chip has label, prompt, icon, kind', () => {
    const r = buildChatSuggestions([{ source_name: 'sales' }]);
    r.chips.forEach(c => {
      assert.ok(c.label);
      assert.ok(c.prompt);
      assert.ok(c.icon);
      assert.ok(c.kind);
    });
  });
});

// ─────────────────────── CHIP_CATALOG sanity ───────────────────────
describe('CHIP_CATALOG', () => {
  test('all role catalogues are non-empty', () => {
    Object.entries(CHIP_CATALOG).forEach(([role, chips]) => {
      assert.ok(Array.isArray(chips) && chips.length > 0, `role ${role} has chips`);
      chips.forEach(c => {
        assert.ok(c.label && c.prompt && c.icon && c.kind, `chip in ${role} fully defined`);
      });
    });
  });
});
