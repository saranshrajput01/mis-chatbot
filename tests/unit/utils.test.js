/**
 * Unit tests for helpers/utils.js
 * Covers: rateLimit, fmtAmt, fmtDate, fmtMonth, getCached/setCache,
 * checkAccess, loadAccessControl, session helpers.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const utils = require('../../helpers/utils');
const {
  rateLimit, fmtAmt, fmtDate, fmtMonth,
  getCached, setCache,
  checkAccess, loadAccessControl,
  setSession, getSession, deleteSession,
} = utils;

// ─────────────────────── rateLimit ───────────────────────
describe('rateLimit', () => {
  test('first request always passes', () => {
    const key = 'rl-test-' + Math.random();
    assert.equal(rateLimit(key, 5, 60), false);
  });
  test('blocks after exceeding maxRequests', () => {
    const key = 'rl-burst-' + Math.random();
    for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 60), false);
    assert.equal(rateLimit(key, 3, 60), true);  // 4th = blocked
    assert.equal(rateLimit(key, 3, 60), true);
  });
  test('different keys are independent', () => {
    const k1 = 'rl-iso1-' + Math.random();
    const k2 = 'rl-iso2-' + Math.random();
    rateLimit(k1, 1, 60);
    assert.equal(rateLimit(k1, 1, 60), true);  // k1 blocked
    assert.equal(rateLimit(k2, 1, 60), false); // k2 fresh
  });
  test('allows count = maxRequests exactly', () => {
    const key = 'rl-edge-' + Math.random();
    for (let i = 0; i < 5; i++) {
      assert.equal(rateLimit(key, 5, 60), false, `request ${i+1}`);
    }
    assert.equal(rateLimit(key, 5, 60), true, '6th blocked');
  });
});

// ─────────────────────── fmtAmt ───────────────────────
describe('fmtAmt', () => {
  test('formats numbers with Indian commas + Rs prefix', () => {
    assert.equal(fmtAmt(1000),        'Rs. 1,000');
    assert.equal(fmtAmt(123456),      'Rs. 1,23,456');
    assert.equal(fmtAmt(10000000),    'Rs. 1,00,00,000');
  });
  test('handles strings with currency symbols', () => {
    assert.equal(fmtAmt('₹1,000'),    'Rs. 1,000');
    assert.equal(fmtAmt('₹1,23,456'), 'Rs. 1,23,456');
  });
  test('null/empty/undefined → Rs. 0', () => {
    assert.equal(fmtAmt(null),        'Rs. 0');
    assert.equal(fmtAmt(undefined),   'Rs. 0');
    assert.equal(fmtAmt(''),          'Rs. 0');
  });
  test('rounds fractions', () => {
    assert.equal(fmtAmt(123.7),       'Rs. 124');
    assert.equal(fmtAmt(123.4),       'Rs. 123');
  });
});

// ─────────────────────── fmtDate ───────────────────────
describe('fmtDate', () => {
  test('ISO date → DD-Mon-YY', () => {
    assert.equal(fmtDate('2026-05-26'), '26-May-26');
    assert.equal(fmtDate('2026-01-01'), '01-Jan-26');
    assert.equal(fmtDate('2026-12-31'), '31-Dec-26');
  });
  test('empty input returns empty string', () => {
    assert.equal(fmtDate(''),        '');
    assert.equal(fmtDate(null),      '');
    assert.equal(fmtDate(undefined), '');
  });
  test('invalid date returns the leading part of the original', () => {
    assert.equal(fmtDate('not-a-date'), 'not-a-date');
  });
  test('Date objects are accepted', () => {
    const result = fmtDate(new Date('2026-05-26'));
    assert.match(result, /-(May)-26$/);
  });
});

// ─────────────────────── fmtMonth ───────────────────────
describe('fmtMonth', () => {
  test('YYYY-MM → Mon-YY', () => {
    assert.equal(fmtMonth('2026-05'), 'May-26');
    assert.equal(fmtMonth('2026-01'), 'Jan-26');
    assert.equal(fmtMonth('2025-12'), 'Dec-25');
  });
  test('null/undefined returns input', () => {
    assert.equal(fmtMonth(null),      null);
    assert.equal(fmtMonth(undefined), undefined);
  });
});

// ─────────────────────── getCached / setCache ───────────────────────
describe('cache helpers', () => {
  test('setCache + getCached round-trip', () => {
    const key = 'cache-test-' + Math.random();
    setCache(key, { hello: 'world' });
    const got = getCached(key);
    assert.deepEqual(got, { hello: 'world' });
  });
  test('missing key returns null', () => {
    assert.equal(getCached('does-not-exist-xyz'), null);
  });
  test('returns null for any falsy after delete (re-set with new val)', () => {
    const key = 'cache-overwrite-' + Math.random();
    setCache(key, 'first');
    setCache(key, 'second');
    assert.equal(getCached(key), 'second');
  });
});

// ─────────────────────── checkAccess / loadAccessControl ───────────────────────
describe('checkAccess', () => {
  test('returns object with allowed key', () => {
    const r = checkAccess('919999999999');
    assert.ok('allowed' in r);
    assert.equal(typeof r.allowed, 'boolean');
  });
  test('mode + name fields present when allowed', () => {
    const r = checkAccess('919999999999');
    if (r.allowed) {
      assert.ok('mode' in r);
      assert.ok('name' in r);
    }
  });
});

describe('loadAccessControl', () => {
  test('returns object with mode field', () => {
    const ac = loadAccessControl();
    assert.ok(ac && typeof ac === 'object');
    assert.ok('mode' in ac);
  });
  test('includes users + allowed_numbers fields', () => {
    const ac = loadAccessControl();
    assert.ok('users' in ac);
    assert.ok('allowed_numbers' in ac || Array.isArray(ac.allowed_numbers));
  });
});

// ─────────────────────── session helpers ───────────────────────
describe('session helpers', () => {
  test('set + get + delete round-trip', () => {
    const phone = 'test-' + Math.random();
    setSession(phone, { foo: 'bar' });
    assert.deepEqual(getSession(phone), { foo: 'bar' });
    deleteSession(phone);
    assert.equal(getSession(phone), undefined);
  });
  test('getSession returns undefined for unknown phone', () => {
    assert.equal(getSession('nope-' + Math.random()), undefined);
  });
});
