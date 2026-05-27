/**
 * Unit tests for helpers/aging-buckets.js
 * Pure-function helper — no DB, no network. Tests cover bucket
 * boundaries, party grouping, and edge cases (NaN, zero, future dates).
 *
 * Run: npm test
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { bucketOf, computeAging, topDefaulters, BUCKETS } = require('../../helpers/aging-buckets');

// Fixed reference for deterministic tests.
const AS_OF = '2026-05-26';

// ─────────────────────── bucketOf ───────────────────────
describe('bucketOf', () => {
  test('boundary at 30 days', () => {
    assert.equal(bucketOf(0),   '0-30');
    assert.equal(bucketOf(15),  '0-30');
    assert.equal(bucketOf(30),  '0-30');
    assert.equal(bucketOf(31),  '31-60');
  });
  test('boundary at 60 days', () => {
    assert.equal(bucketOf(60),  '31-60');
    assert.equal(bucketOf(61),  '61-90');
  });
  test('boundary at 90 days', () => {
    assert.equal(bucketOf(90),  '61-90');
    assert.equal(bucketOf(91),  '90+');
    assert.equal(bucketOf(365), '90+');
  });
  test('non-numeric / negative falls back to 0-30', () => {
    assert.equal(bucketOf(-5),       '0-30');
    assert.equal(bucketOf(NaN),      '0-30');
    assert.equal(bucketOf(undefined),'0-30');
    assert.equal(bucketOf('xyz'),    '0-30');
  });
});

// ─────────────────────── computeAging ───────────────────────
describe('computeAging', () => {
  test('empty/null rows → all-zero summary', () => {
    const r1 = computeAging([], AS_OF);
    assert.equal(r1.total, 0);
    assert.equal(r1.totalCount, 0);
    assert.deepEqual(r1.buckets, { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
    assert.equal(r1.oldest, null);

    const r2 = computeAging(null, AS_OF);
    assert.equal(r2.total, 0);

    const r3 = computeAging(undefined, AS_OF);
    assert.equal(r3.total, 0);
  });

  test('rows fall into correct buckets', () => {
    const rows = [
      { amount: 1000, date: '2026-05-20' }, // 6 days ago → 0-30
      { amount: 2000, date: '2026-04-20' }, // 36 days ago → 31-60
      { amount: 3000, date: '2026-03-15' }, // 72 days ago → 61-90
      { amount: 4000, date: '2026-01-01' }  // 145 days ago → 90+
    ];
    const r = computeAging(rows, AS_OF);
    assert.equal(r.buckets['0-30'],  1000);
    assert.equal(r.buckets['31-60'], 2000);
    assert.equal(r.buckets['61-90'], 3000);
    assert.equal(r.buckets['90+'],   4000);
    assert.equal(r.total, 10000);
    assert.equal(r.totalCount, 4);
  });

  test('counts mirror buckets', () => {
    const rows = [
      { amount: 100, date: '2026-05-25' },
      { amount: 200, date: '2026-05-24' },
      { amount: 500, date: '2026-04-01' }  // 55 days ago → 31-60
    ];
    const r = computeAging(rows, AS_OF);
    assert.equal(r.counts['0-30'], 2);
    assert.equal(r.counts['31-60'], 1);
    assert.equal(r.counts['61-90'], 0);
  });

  test('oldest tracked correctly', () => {
    const rows = [
      { amount: 100, date: '2026-05-20', party: 'A' },
      { amount: 999, date: '2025-11-01', party: 'B' }, // ~205 days ago
      { amount: 200, date: '2026-04-15', party: 'C' }
    ];
    const r = computeAging(rows, AS_OF);
    assert.equal(r.oldest.party, 'B');
    assert.ok(r.oldest.age > 100);
    assert.equal(r.oldest.amount, 999);
  });

  test('zero & negative amounts skipped', () => {
    const rows = [
      { amount: 0,   date: '2026-05-20' },
      { amount: -50, date: '2026-05-21' },
      { amount: 100, date: '2026-05-22' }
    ];
    const r = computeAging(rows, AS_OF);
    assert.equal(r.totalCount, 1);
    assert.equal(r.total, 100);
  });

  test('invalid dates skipped', () => {
    const rows = [
      { amount: 100, date: 'not-a-date' },
      { amount: 200, date: '2026-05-20' },
      { amount: 300, date: '' }
    ];
    const r = computeAging(rows, AS_OF);
    assert.equal(r.totalCount, 1);
    assert.equal(r.total, 200);
  });

  test('asOf default = today (no crash)', () => {
    const r = computeAging([{ amount: 100, date: new Date() }]);
    assert.equal(r.totalCount, 1);
    assert.ok(r.asOf.match(/^\d{4}-\d{2}-\d{2}$/));
  });
});

// ─────────────────────── topDefaulters ───────────────────────
describe('topDefaulters', () => {
  test('groups by party + sorts DESC by total', () => {
    const rows = [
      { amount: 100,  date: '2026-05-25', party: 'Alpha' },
      { amount: 5000, date: '2026-05-20', party: 'Bravo' },
      { amount: 200,  date: '2026-04-01', party: 'Alpha' },
      { amount: 300,  date: '2026-03-01', party: 'Charlie' }
    ];
    const r = topDefaulters(rows, AS_OF);
    assert.equal(r[0].party, 'Bravo');
    assert.equal(r[0].total, 5000);
    assert.equal(r[1].party, 'Alpha');
    assert.equal(r[1].total, 300);
    assert.equal(r[2].party, 'Charlie');
  });

  test('party "NA" or empty filtered out', () => {
    const rows = [
      { amount: 100, date: '2026-05-20', party: 'NA' },
      { amount: 200, date: '2026-05-20', party: '' },
      { amount: 300, date: '2026-05-20', party: 'Real' }
    ];
    const r = topDefaulters(rows, AS_OF);
    assert.equal(r.length, 1);
    assert.equal(r[0].party, 'Real');
  });

  test('limit honoured', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      amount: 100 + i,
      date: '2026-05-20',
      party: `Party-${i}`
    }));
    const r = topDefaulters(rows, AS_OF, 5);
    assert.equal(r.length, 5);
  });

  test('per-party bucket distribution', () => {
    const rows = [
      { amount: 1000, date: '2026-05-25', party: 'X' }, // 0-30
      { amount: 2000, date: '2026-04-01', party: 'X' }, // 31-60
      { amount: 5000, date: '2026-01-01', party: 'X' }  // 90+
    ];
    const r = topDefaulters(rows, AS_OF);
    assert.equal(r[0].party, 'X');
    assert.equal(r[0].total, 8000);
    assert.equal(r[0].buckets['0-30'],  1000);
    assert.equal(r[0].buckets['31-60'], 2000);
    assert.equal(r[0].buckets['90+'],   5000);
  });
});

// ─────────────────────── BUCKETS export ───────────────────────
describe('BUCKETS constant', () => {
  test('exposes ordered bucket labels', () => {
    assert.deepEqual(BUCKETS, ['0-30', '31-60', '61-90', '90+']);
  });
});
