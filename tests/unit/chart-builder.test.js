/**
 * Unit tests for helpers/chart-builder.js
 * Tests pure helpers: pickUnit, truncateLabel, buildChartLiteral.
 * (renderChartPng + downloadChartImage need network — covered in integration tests)
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { pickUnit, truncateLabel, buildChartLiteral, COLORS, buildChartURL } =
  require('../../helpers/chart-builder');

// ─────────────────────── pickUnit ───────────────────────
describe('pickUnit', () => {
  test('values < 1000 → no unit', () => {
    const r = pickUnit([100, 250, 500]);
    assert.equal(r.unit, '');
    assert.equal(r.divisor, 1);
  });
  test('values in thousands → K', () => {
    const r = pickUnit([5000, 12000, 8000]);
    assert.equal(r.unit, 'K');
    assert.equal(r.divisor, 1000);
  });
  test('values in lakhs → L', () => {
    const r = pickUnit([100000, 500000, 800000]);
    assert.equal(r.unit, 'L');
    assert.equal(r.divisor, 100000);
  });
  test('values in crores → Cr', () => {
    const r = pickUnit([10000000, 50000000]);
    assert.equal(r.unit, 'Cr');
    assert.equal(r.divisor, 10000000);
  });
  test('mixed magnitudes → uses max', () => {
    const r = pickUnit([100, 50000000]);
    assert.equal(r.unit, 'Cr');
  });
  test('handles negative values via abs()', () => {
    const r = pickUnit([-50000000, 100]);
    assert.equal(r.unit, 'Cr');
  });
  test('handles non-number entries gracefully', () => {
    const r = pickUnit(['foo', null, undefined, 5000]);
    assert.equal(r.unit, 'K');
  });
  test('empty array → no unit', () => {
    const r = pickUnit([]);
    assert.equal(r.unit, '');
  });
});

// ─────────────────────── truncateLabel ───────────────────────
describe('truncateLabel', () => {
  test('preserves short strings', () => {
    assert.equal(truncateLabel('Hello'), 'Hello');
    assert.equal(truncateLabel('Bharat'), 'Bharat');
  });
  test('truncates long strings to default 25', () => {
    const r = truncateLabel('Bharat Heavy Electricals Limited');
    assert.ok(r.length <= 25);
    assert.match(r, /…$/);
  });
  test('respects custom max length', () => {
    assert.equal(truncateLabel('Hello World', 5), 'Hell…');
  });
  test('null/undefined → empty string', () => {
    assert.equal(truncateLabel(null),      '');
    assert.equal(truncateLabel(undefined), '');
  });
  test('non-string inputs coerced', () => {
    assert.equal(truncateLabel(123), '123');
  });
  test('exactly at max length is preserved (no ellipsis)', () => {
    const s = 'x'.repeat(25);
    assert.equal(truncateLabel(s), s);
    assert.notMatch(truncateLabel(s), /…/);
  });
});

// ─────────────────────── buildChartLiteral ───────────────────────
describe('buildChartLiteral', () => {
  const sampleConfig = { type: 'bar', title: 'Sales by Customer', label_col: 'customer', value_col: 'amount' };
  const sampleRows = [
    { customer: 'A', amount: 50000 },
    { customer: 'B', amount: 75000 },
    { customer: 'C', amount: 120000 },
  ];

  test('returns a JS literal string', () => {
    const r = buildChartLiteral(sampleConfig, sampleRows);
    assert.equal(typeof r.jsLiteral, 'string');
    assert.match(r.jsLiteral, /^\{/);
  });

  test('exposes detected unit + scaledValues + labels', () => {
    const r = buildChartLiteral(sampleConfig, sampleRows);
    assert.equal(r.unit, 'L');
    assert.equal(r.scaledValues.length, 3);
    assert.deepEqual(r.labels, ['A', 'B', 'C']);
  });

  test('appends unit to chart title when scaling', () => {
    const r = buildChartLiteral(sampleConfig, sampleRows);
    assert.match(r.jsLiteral, /Sales by Customer \(in L\)/);
  });

  test('does not append unit when no scaling', () => {
    const tinyRows = [{ x: 'A', y: 5 }, { x: 'B', y: 10 }];
    const r = buildChartLiteral({ type: 'bar', title: 'Tiny', label_col: 'x', value_col: 'y' }, tinyRows);
    assert.equal(r.unit, '');
    assert.match(r.jsLiteral, /'Tiny'/);
  });

  test('pie/doughnut → adds legend display + colour array', () => {
    const r = buildChartLiteral({ ...sampleConfig, type: 'pie' }, sampleRows);
    assert.match(r.jsLiteral, /legend.*display: true/);
  });

  test('line chart → includes border + tension config', () => {
    const r = buildChartLiteral({ ...sampleConfig, type: 'line' }, sampleRows);
    assert.match(r.jsLiteral, /borderColor/);
    assert.match(r.jsLiteral, /tension/);
  });

  test('truncates long labels', () => {
    const longRows = [{ x: 'A'.repeat(50), y: 100 }];
    const r = buildChartLiteral({ type: 'bar', title: 'T', label_col: 'x', value_col: 'y' }, longRows);
    assert.ok(r.labels[0].length <= 25);
  });

  test('respects custom maxLabelChars opt', () => {
    const longRows = [{ x: 'A'.repeat(50), y: 100 }];
    const r = buildChartLiteral({ type: 'bar', title: 'T', label_col: 'x', value_col: 'y' }, longRows, { maxLabelChars: 10 });
    assert.ok(r.labels[0].length <= 10);
  });

  test('handles missing values as 0', () => {
    const r = buildChartLiteral({ type: 'bar', title: 'T', label_col: 'x', value_col: 'y' }, [{ x: 'A' }]);
    assert.equal(r.scaledValues[0], 0);
  });

  test('escapes single quotes in titles', () => {
    const r = buildChartLiteral({ type: 'bar', title: "Sam's Chart", label_col: 'x', value_col: 'y' }, [{ x: 'A', y: 1 }]);
    assert.match(r.jsLiteral, /Sam\\'s/);
  });
});

// ─────────────────────── COLORS palette ───────────────────────
describe('COLORS', () => {
  test('palette has 12 entries', () => {
    assert.equal(COLORS.length, 12);
  });
  test('all entries are hex colors', () => {
    COLORS.forEach(c => assert.match(c, /^#[0-9a-fA-F]{6}$/));
  });
});

// ─────────────────────── buildChartURL legacy shim ───────────────────────
describe('buildChartURL (legacy)', () => {
  test('returns sentinel object', () => {
    const r = buildChartURL({ type: 'bar' }, [{ a: 1 }]);
    assert.equal(r.__chartRenderRequest, true);
    assert.deepEqual(r.chartConfig, { type: 'bar' });
    assert.deepEqual(r.rows, [{ a: 1 }]);
  });
});
