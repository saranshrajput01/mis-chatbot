/**
 * Unit tests for helpers/anomaly.js
 * Pure z-score detector — tests cover thresholds, edge cases (flat history,
 * insufficient points, last-zero detection, bidirectional sigma).
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { detectAnomaly, mean, stdDev } = require('../../helpers/anomaly');

// ─────────────────────── mean ───────────────────────
describe('mean', () => {
  test('returns 0 on empty array', () => {
    assert.equal(mean([]), 0);
  });
  test('computes correctly', () => {
    assert.equal(mean([1, 2, 3, 4, 5]), 3);
    assert.equal(mean([10]), 10);
    assert.equal(mean([0, 0, 0]), 0);
  });
  test('handles negative numbers', () => {
    assert.equal(mean([-2, 0, 2]), 0);
  });
});

// ─────────────────────── stdDev ───────────────────────
describe('stdDev', () => {
  test('returns 0 for arrays < 2 elements', () => {
    assert.equal(stdDev([]), 0);
    assert.equal(stdDev([5]), 0);
  });
  test('flat array returns 0', () => {
    assert.equal(stdDev([5, 5, 5, 5]), 0);
  });
  test('computes sample stddev (n-1 divisor)', () => {
    // [2,4,4,4,5,5,7,9] → mean=5, sample stddev=2
    const result = stdDev([2, 4, 4, 4, 5, 5, 7, 9]);
    assert.ok(Math.abs(result - 2.138) < 0.01, `got ${result}`);
  });
  test('accepts pre-computed mean', () => {
    const arr = [1, 2, 3, 4, 5];
    const m = mean(arr);
    const direct = stdDev(arr);
    const cached  = stdDev(arr, m);
    assert.equal(direct, cached);
  });
});

// ─────────────────────── detectAnomaly ───────────────────────
describe('detectAnomaly: insufficient data', () => {
  test('< 7 points returns null', () => {
    assert.equal(detectAnomaly([]), null);
    assert.equal(detectAnomaly([1, 2, 3]), null);
    assert.equal(detectAnomaly([1, 2, 3, 4, 5, 6]), null);
  });
  test('non-array returns null', () => {
    assert.equal(detectAnomaly(null), null);
    assert.equal(detectAnomaly(undefined), null);
    assert.equal(detectAnomaly('string'), null);
  });
  test('respects custom minPoints', () => {
    assert.equal(detectAnomaly([1, 2, 3], { minPoints: 5 }), null);
    const r = detectAnomaly([1, 2, 3, 4, 5], { minPoints: 5 });
    assert.ok(r !== null);
  });
});

describe('detectAnomaly: flat history', () => {
  test('flat history with same last value → not flagged', () => {
    const r = detectAnomaly([10, 10, 10, 10, 10, 10, 10, 10]);
    assert.equal(r.flagged, false);
    assert.equal(r.sigma, 0);
    assert.match(r.reason, /flat/);
  });
  test('flat history with different last → flagged Infinity sigma', () => {
    const r = detectAnomaly([5, 5, 5, 5, 5, 5, 5, 99]);
    assert.equal(r.flagged, true);
    assert.equal(r.sigma, Infinity);
    assert.match(r.reason, /breaks a flat history/);
  });
});

describe('detectAnomaly: normal range', () => {
  test('value within 2σ → not flagged', () => {
    const arr = [10, 11, 9, 10, 12, 11, 10, 11];
    const r = detectAnomaly(arr);
    assert.equal(r.flagged, false);
    assert.match(r.reason, /normal range/);
    assert.ok(typeof r.sigma === 'number');
  });
});

describe('detectAnomaly: outliers', () => {
  test('high outlier flagged with positive sigma', () => {
    // 7 small values + 1 huge spike
    const r = detectAnomaly([1, 1, 2, 1, 1, 2, 1, 100]);
    assert.equal(r.flagged, true);
    assert.ok(r.sigma > 2);
    assert.match(r.reason, /above/);
  });
  test('low outlier flagged with negative sigma', () => {
    const r = detectAnomaly([100, 110, 95, 100, 105, 102, 98, -50]);
    assert.equal(r.flagged, true);
    assert.ok(r.sigma < -2);
    assert.match(r.reason, /below/);
  });
  test('custom threshold (1σ instead of 2)', () => {
    // mild deviation that wouldn't trigger 2σ but does at 1σ
    const arr = [10, 11, 9, 10, 12, 11, 10, 14];
    const r2 = detectAnomaly(arr, { threshold: 2 });
    const r1 = detectAnomaly(arr, { threshold: 1 });
    assert.equal(r2.flagged, false);
    assert.equal(r1.flagged, true);
  });
});

describe('detectAnomaly: zero-today special case', () => {
  test('today=0 with all-positive history → flagged', () => {
    const r = detectAnomaly([5, 4, 6, 7, 5, 6, 5, 0]);
    assert.equal(r.flagged, true);
    assert.equal(r.sigma, -Infinity);
    assert.match(r.reason, /zero/);
  });
  test('today=0 but history had zeros too → use sigma logic', () => {
    const r = detectAnomaly([5, 0, 6, 0, 5, 6, 5, 0]);
    // mean ~3.4, std nonzero, last=0 ≈ -1σ — within normal range at threshold 2
    assert.equal(r.flagged, false);
  });
});

describe('detectAnomaly: data sanitization', () => {
  test('NaN values coerced to 0', () => {
    const r = detectAnomaly([1, NaN, 2, 3, 1, 2, 1, 2]);
    assert.ok(r !== null);
    assert.ok(typeof r.sigma === 'number');
  });
  test('string numbers coerced', () => {
    const r = detectAnomaly(['1', '2', '3', '1', '2', '1', '2', '1']);
    assert.ok(r !== null);
  });
});

describe('detectAnomaly: return shape', () => {
  test('returns all required fields when flagged', () => {
    const r = detectAnomaly([1, 1, 1, 1, 1, 1, 1, 100]);
    assert.ok('flagged' in r);
    assert.ok('sigma' in r);
    assert.ok('reason' in r);
    assert.ok('last' in r);
    assert.ok('mean' in r);
    assert.ok('std' in r);
  });
});
