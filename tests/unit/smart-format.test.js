/**
 * Unit tests for helpers/smart-format.js
 * Covers: formatCurrency, formatQuantity, formatRate, formatPercent,
 * formatCount, inferRoleFromKey, humanizeLabel, buildRoleMap, formatResults.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  formatCurrency, formatQuantity, formatRate, formatPercent, formatCount,
  formatValue,
  inferRoleFromKey, humanizeLabel, buildRoleMap,
  formatResults,
} = require('../../helpers/smart-format');

// ─────────────────────── formatCurrency ───────────────────────
describe('formatCurrency', () => {
  test('zero', () => {
    assert.equal(formatCurrency(0), '₹0');
  });
  test('small numbers', () => {
    assert.equal(formatCurrency(1000), '₹1,000');
  });
  test('lakhs adds (L) tag', () => {
    const r = formatCurrency(150000);
    assert.match(r, /₹1,50,000/);
    assert.match(r, /₹1\.50 L/);
  });
  test('crores adds (Cr) tag', () => {
    const r = formatCurrency(15000000);
    assert.match(r, /₹1,50,00,000/);
    assert.match(r, /₹1\.50 Cr/);
  });
  test('negative numbers', () => {
    const r = formatCurrency(-1000);
    assert.match(r, /^-₹/);
  });
  test('null/empty/NaN returns empty string', () => {
    assert.equal(formatCurrency(null),      '');
    assert.equal(formatCurrency(undefined), '');
    assert.equal(formatCurrency(''),        '');
    assert.equal(formatCurrency(NaN),       '');
  });
});

// ─────────────────────── formatQuantity ───────────────────────
describe('formatQuantity', () => {
  test('with unit appended', () => {
    assert.equal(formatQuantity(1000, 'KG'), '1,000 KG');
  });
  test('without unit', () => {
    assert.equal(formatQuantity(500), '500');
  });
  test('preserves decimals up to 3', () => {
    assert.match(formatQuantity(1.234, 'kg'), /1\.234 kg/);
  });
  test('null/empty returns empty', () => {
    assert.equal(formatQuantity(null), '');
    assert.equal(formatQuantity(''),   '');
  });
});

// ─────────────────────── formatRate / formatPercent / formatCount ───────────────────────
describe('formatRate', () => {
  test('formats with ₹ prefix', () => {
    assert.equal(formatRate(70), '₹70');
    assert.equal(formatRate(70.5), '₹70.5');
  });
  test('null returns empty', () => {
    assert.equal(formatRate(null), '');
  });
});

describe('formatPercent', () => {
  test('appends %', () => {
    assert.equal(formatPercent(12.5), '12.50%');
    assert.equal(formatPercent(0), '0.00%');
  });
});

describe('formatCount', () => {
  test('integers — Indian comma format', () => {
    assert.equal(formatCount(1000),    '1,000');
    assert.equal(formatCount(1234567), '12,34,567');
  });
  test('floats — 2 decimals max', () => {
    assert.match(formatCount(1.5), /1\.5/);
  });
});

// ─────────────────────── inferRoleFromKey ───────────────────────
describe('inferRoleFromKey', () => {
  test('id-like names', () => {
    assert.equal(inferRoleFromKey('voucher_no'), 'id');
    assert.equal(inferRoleFromKey('invoice_no'), 'id');
    assert.equal(inferRoleFromKey('id'), 'id');
    assert.equal(inferRoleFromKey('hsn'), 'id');
  });
  test('date-like names', () => {
    assert.equal(inferRoleFromKey('created_at'),  'date');
    assert.equal(inferRoleFromKey('invoice_date'),'date');
    assert.equal(inferRoleFromKey('date'),        'date');
  });
  test('currency-like names', () => {
    assert.equal(inferRoleFromKey('total_amount'),  'currency');
    assert.equal(inferRoleFromKey('cgst'),          'currency');
    assert.equal(inferRoleFromKey('balance'),       'currency');
    assert.equal(inferRoleFromKey('sales'),         'currency');
  });
  test('count-like names', () => {
    assert.equal(inferRoleFromKey('count'),          'count');
    assert.equal(inferRoleFromKey('invoice_count'),  'count');
    assert.equal(inferRoleFromKey('total_orders'),   'count');
  });
  test('quantity-like names', () => {
    assert.equal(inferRoleFromKey('qty'),         'quantity');
    assert.equal(inferRoleFromKey('total_qty'),   'quantity');
    assert.equal(inferRoleFromKey('weight'),      'quantity');
  });
  test('entity-like names', () => {
    assert.equal(inferRoleFromKey('customer_name'),  'entity');
    assert.equal(inferRoleFromKey('party_name'),     'entity');
    assert.equal(inferRoleFromKey('supplier'),       'entity');
  });
  test('sales_person should NOT be currency despite "sales" keyword', () => {
    assert.equal(inferRoleFromKey('sales_person'), 'entity');
    assert.equal(inferRoleFromKey('salesperson'),  'entity');
  });
  test('city/location names', () => {
    assert.equal(inferRoleFromKey('city'),     'location');
    assert.equal(inferRoleFromKey('state'),    'location');
    assert.equal(inferRoleFromKey('shipping_city'), 'location');
  });
  test('avg_rate w/ small value → rate, large → currency', () => {
    assert.equal(inferRoleFromKey('avg_rate', 70),    'rate');
    assert.equal(inferRoleFromKey('avg_rate', 50000), 'currency');
  });
  test('unknown text fallback', () => {
    assert.equal(inferRoleFromKey('something'), 'text');
  });
  test('numeric value with unknown key returns "number"', () => {
    assert.equal(inferRoleFromKey('weird_key', 42), 'number');
  });
});

// ─────────────────────── humanizeLabel ───────────────────────
describe('humanizeLabel', () => {
  test('replaces underscores with spaces, title-cases', () => {
    assert.equal(humanizeLabel('total_amount'), 'Total Amount');
    assert.equal(humanizeLabel('customer_name'), 'Customer Name');
  });
  test('preserves all-caps acronyms', () => {
    assert.equal(humanizeLabel('cgst_amount'), 'CGST Amount');
    assert.equal(humanizeLabel('hsn'),         'HSN');
    assert.equal(humanizeLabel('id'),          'ID');
  });
  test('null/empty handled', () => {
    assert.equal(humanizeLabel(null), '');
    assert.equal(humanizeLabel(''),   '');
  });
});

// ─────────────────────── buildRoleMap ───────────────────────
describe('buildRoleMap', () => {
  test('maps from tableColumns metadata', () => {
    const row = { amount: 1000, customer: 'X' };
    const cols = [
      { pg_name: 'amount',   role: 'currency', original: 'Amount' },
      { pg_name: 'customer', role: 'entity',   original: 'Customer' },
    ];
    const m = buildRoleMap(row, cols);
    assert.equal(m.amount.role,   'currency');
    assert.equal(m.customer.role, 'entity');
  });
  test('falls back to inference for unmapped keys', () => {
    const row = { amount: 1000, mystery_field: 'X' };
    const cols = [{ pg_name: 'amount', role: 'currency', original: 'Amount' }];
    const m = buildRoleMap(row, cols);
    assert.equal(m.amount.role,        'currency');
    assert.equal(m.mystery_field.role, 'text');
  });
  test('handles empty tableColumns gracefully', () => {
    const m = buildRoleMap({ qty: 5 }, []);
    assert.equal(m.qty.role, 'quantity');
  });
  test('handles empty row', () => {
    const m = buildRoleMap({}, []);
    assert.deepEqual(m, {});
  });
});

// ─────────────────────── formatValue ───────────────────────
describe('formatValue', () => {
  test('routes to correct role formatter', () => {
    assert.equal(formatValue(1000, 'currency'),  '₹1,000');
    assert.equal(formatValue(70,   'rate'),      '₹70');
    assert.equal(formatValue(12.5, 'percent'),   '12.50%');
    assert.equal(formatValue(5,    'count'),     '5');
    assert.equal(formatValue('abc','text'),      'abc');
  });
  test('null/empty short-circuits to empty string', () => {
    assert.equal(formatValue(null,      'currency'), '');
    assert.equal(formatValue(undefined, 'currency'), '');
    assert.equal(formatValue('',        'currency'), '');
  });
  test('falls back to plain when numeric formatter rejects text', () => {
    // 'ABC' passed to currency role → currency formatter returns '' → fallback to plain
    assert.equal(formatValue('ABC', 'currency'), 'ABC');
  });
});

// ─────────────────────── formatResults ───────────────────────
describe('formatResults', () => {
  test('null/empty rows returns null', () => {
    assert.equal(formatResults('q', null), null);
    assert.equal(formatResults('q', []),   null);
  });
  test('single row → vertical key:value layout with 📊 prefix', () => {
    const rows = [{ amount: 1000, customer: 'ACME' }];
    const r = formatResults('q', rows);
    assert.match(r, /^📊/);
    assert.match(r, /Amount/);
    assert.match(r, /Customer/);
  });
  test('multi-row (≤15) → numbered emoji list with summary', () => {
    const rows = [
      { amount: 100, customer: 'A' },
      { amount: 200, customer: 'B' },
    ];
    const r = formatResults('q', rows);
    assert.match(r, /2 results/);
    assert.match(r, /1️⃣/);
    assert.match(r, /2️⃣/);
    assert.match(r, /Total across 2/);
  });
  test('>15 rows returns null (caller switches to AI/CSV/PDF)', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ amount: i * 100 }));
    assert.equal(formatResults('q', rows), null);
  });
});
