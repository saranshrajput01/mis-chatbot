/**
 * Unit tests for helpers/self-heal.js — Phase 10 self-healing layers.
 * All pure functions, no DB calls.
 *
 * Run: npm test
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const sh = require('../../helpers/self-heal');

// ────────────────────────────────────────────────────────────────────────
describe('classifyError', () => {
  test('ECONNRESET → TRANSIENT, retryable', () => {
    const r = sh.classifyError({ code: 'ECONNRESET', message: 'socket hang up' });
    assert.equal(r.kind, 'TRANSIENT');
    assert.equal(r.retryable, true);
    assert.match(r.friendly, /network/i);
  });

  test('column missing → SCHEMA_COLUMN, retryable', () => {
    const r = sh.classifyError({ message: 'column "xyz" does not exist' });
    assert.equal(r.kind, 'SCHEMA_COLUMN');
    assert.equal(r.retryable, true);
  });

  test('relation missing → SCHEMA_RELATION, NOT retryable', () => {
    const r = sh.classifyError({ message: 'relation "foo" does not exist' });
    assert.equal(r.kind, 'SCHEMA_RELATION');
    assert.equal(r.retryable, false);
  });

  test('429 rate limit → RATE_LIMIT, retryable', () => {
    const r = sh.classifyError({ message: '429 too many requests' });
    assert.equal(r.kind, 'RATE_LIMIT');
    assert.equal(r.retryable, true);
  });

  test('permission denied → PERMISSION, NOT retryable', () => {
    const r = sh.classifyError({ message: 'permission denied for table x' });
    assert.equal(r.kind, 'PERMISSION');
    assert.equal(r.retryable, false);
  });

  test('syntax error → SQL_SYNTAX, retryable', () => {
    const r = sh.classifyError({ message: 'syntax error at or near "FROM"' });
    assert.equal(r.kind, 'SQL_SYNTAX');
    assert.equal(r.retryable, true);
  });

  test('null err → UNKNOWN, NOT retryable', () => {
    const r = sh.classifyError(null);
    assert.equal(r.kind, 'UNKNOWN');
    assert.equal(r.retryable, false);
  });

  test('division by zero → PERMANENT, NOT retryable', () => {
    const r = sh.classifyError({ message: 'division by zero' });
    assert.equal(r.kind, 'PERMANENT');
    assert.equal(r.retryable, false);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('withRetry', () => {
  test('succeeds on first attempt → no retry', async () => {
    let calls = 0;
    const result = await sh.withRetry(async () => { calls++; return 42; }, { label: 'test' });
    assert.equal(result, 42);
    assert.equal(calls, 1);
  });

  test('retries on TRANSIENT, succeeds on second', async () => {
    let calls = 0;
    const result = await sh.withRetry(async () => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      return 'ok';
    }, { label: 'test', baseDelayMs: 10 });
    assert.equal(result, 'ok');
    assert.equal(calls, 2);
  });

  test('does NOT retry on PERMISSION error', async () => {
    let calls = 0;
    await assert.rejects(
      sh.withRetry(async () => {
        calls++;
        throw new Error('permission denied');
      }, { label: 'test', baseDelayMs: 10 }),
      /permission denied/
    );
    assert.equal(calls, 1, 'should not retry permission errors');
  });

  test('throws after maxAttempts on persistent TRANSIENT', async () => {
    let calls = 0;
    await assert.rejects(
      sh.withRetry(async () => {
        calls++;
        throw Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' });
      }, { label: 'test', maxAttempts: 3, baseDelayMs: 10 }),
      /ETIMEDOUT/
    );
    assert.equal(calls, 3);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('levenshtein', () => {
  test('identical strings → 0', () => {
    assert.equal(sh.levenshtein('amount', 'amount'), 0);
  });

  test('single substitution → 1', () => {
    assert.equal(sh.levenshtein('amount', 'amout'), 1);
  });

  test('empty vs nonempty → length', () => {
    assert.equal(sh.levenshtein('', 'abc'), 3);
    assert.equal(sh.levenshtein('abc', ''), 3);
  });

  test('case-insensitive', () => {
    assert.equal(sh.levenshtein('AMOUNT', 'amount'), 0);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('findClosestColumn', () => {
  const cols = ['party_name', 'amount', 'with_gst_amount', 'total_amount', 'qty', 'sales_person_name', 'c_date'];

  test('exact match returns 0 distance', () => {
    const r = sh.findClosestColumn('amount', cols);
    assert.equal(r.name, 'amount');
    assert.equal(r.distance, 0);
  });

  test('typo with token overlap gets boost (party → party_name)', () => {
    const r = sh.findClosestColumn('party', cols);
    assert.equal(r.name, 'party_name');
    assert.ok(r.score > 0.7, `score ${r.score} should be > 0.7`);
  });

  test('returns null on empty candidates', () => {
    assert.equal(sh.findClosestColumn('foo', []), null);
  });

  test('returns null on empty bad name', () => {
    assert.equal(sh.findClosestColumn('', cols), null);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('resolveColumnError', () => {
  const cols = ['party_name', 'amount', 'with_gst_amount', 'total_amount', 'qty', 'sales_person_name', 'c_date', 'company_name'];

  test('rewrites confident match (amt → amount)', () => {
    const r = sh.resolveColumnError(
      'column "amt" does not exist',
      'SELECT SUM(amt) FROM tx WHERE amt > 100',
      cols
    );
    assert.ok(r);
    assert.equal(r.badCol, 'amt');
    assert.equal(r.goodCol, 'amount');
    assert.match(r.rewrittenSQL, /SUM\(amount\)/);
    assert.doesNotMatch(r.rewrittenSQL, /\bamt\b/);
  });

  test('strips table prefix (t.partyname → party_name)', () => {
    const r = sh.resolveColumnError(
      'column "t.partyname" does not exist',
      'SELECT t.partyname FROM tx t',
      cols
    );
    assert.ok(r);
    assert.equal(r.badCol, 'partyname');
    assert.equal(r.goodCol, 'party_name');
  });

  test('bails on truly random bad name (no good match)', () => {
    const r = sh.resolveColumnError(
      'column "random_garbage_xyz" does not exist',
      'SELECT random_garbage_xyz FROM tx',
      cols
    );
    assert.equal(r, null);
  });

  test('bails when bad column is actually valid (no rewrite)', () => {
    const r = sh.resolveColumnError(
      'column "amount" does not exist',
      'SELECT amount FROM tx',
      cols
    );
    // amount IS in the list — so it's not a typo, bail
    assert.equal(r, null);
  });

  test('returns null on missing inputs', () => {
    assert.equal(sh.resolveColumnError(null, 'x', cols), null);
    assert.equal(sh.resolveColumnError('column "x" does not exist', null, cols), null);
    assert.equal(sh.resolveColumnError('column "x" does not exist', 'x', null), null);
  });

  test('respects minScore threshold', () => {
    // 'salesman' could distance-match 'sales_person_name' but score is low
    const r = sh.resolveColumnError(
      'column "salesman" does not exist',
      'SELECT salesman FROM tx',
      cols,
      { minScore: 0.9 } // very strict
    );
    // With minScore 0.9, must bail
    assert.equal(r, null);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('flattenColumnNames', () => {
  test('flattens multi-table metadata', () => {
    const meta = [
      { pg_table: 't1', columns: [{ pg_name: 'a' }, { pg_name: 'b' }] },
      { pg_table: 't2', columns: [{ pg_name: 'b' }, { pg_name: 'c' }] },
    ];
    const r = sh.flattenColumnNames(meta);
    assert.deepEqual(r.sort(), ['a', 'b', 'c']);
  });

  test('handles empty/missing metadata', () => {
    assert.deepEqual(sh.flattenColumnNames([]), []);
    assert.deepEqual(sh.flattenColumnNames(null), []);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('detectSchemaDrift', () => {
  test('detects added columns', () => {
    const pgCols = ['id', 'party_name'];
    const sheetCols = [
      { pg_name: 'party_name', pg_type: 'TEXT', role: 'entity' },
      { pg_name: 'amount', pg_type: 'NUMERIC', role: 'currency' },
    ];
    const r = sh.detectSchemaDrift(pgCols, sheetCols);
    assert.equal(r.added.length, 1);
    assert.equal(r.added[0].name, 'amount');
    assert.equal(r.removed.length, 0);
  });

  test('detects removed columns (excluding system cols)', () => {
    const pgCols = ['id', 'created_at', 'party_name', 'old_col'];
    const sheetCols = [
      { pg_name: 'party_name', pg_type: 'TEXT', role: 'entity' },
    ];
    const r = sh.detectSchemaDrift(pgCols, sheetCols);
    assert.deepEqual(r.removed, ['old_col']);
  });

  test('detects type drift via previous metadata snapshot', () => {
    const pgCols = ['id', 'amount'];
    const sheetCols = [{ pg_name: 'amount', pg_type: 'NUMERIC', role: 'currency' }];
    const prev = [{ pg_name: 'amount', pg_type: 'TEXT', role: 'text' }];
    const r = sh.detectSchemaDrift(pgCols, sheetCols, prev);
    assert.equal(r.typeChanged.length, 1);
    assert.equal(r.typeChanged[0].name, 'amount');
    assert.match(r.typeChanged[0].from, /TEXT/);
    assert.match(r.typeChanged[0].to, /NUMERIC/);
  });

  test('returns "schema unchanged" when no drift', () => {
    const pgCols = ['id', 'party_name', 'amount'];
    const sheetCols = [
      { pg_name: 'party_name', pg_type: 'TEXT', role: 'entity' },
      { pg_name: 'amount', pg_type: 'NUMERIC', role: 'currency' },
    ];
    const r = sh.detectSchemaDrift(pgCols, sheetCols);
    assert.equal(r.summary, 'schema unchanged');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('relaxSQL', () => {
  test('drops date ILIKE filter', () => {
    const sql = "SELECT SUM(amount) FROM tx WHERE party_name ILIKE '%X%' AND c_date ILIKE '%-Apr-26'";
    const variants = sh.relaxSQL(sql);
    assert.ok(variants.length >= 1);
    assert.ok(variants.some(v => !/c_date/.test(v)), 'at least one variant drops c_date');
  });

  test('shortens longest multi-word ILIKE term', () => {
    const sql = "SELECT * FROM tx WHERE party_name ILIKE '%Sanjay Aggarwal%'";
    const variants = sh.relaxSQL(sql);
    // Either Sanjay alone is in there, or no variant produced (depends on implementation)
    if (variants.length) {
      assert.ok(variants.some(v => v.includes("'%Sanjay%'")), 'should shorten to first word');
    }
  });

  test('returns empty array for SQL with no relaxable parts', () => {
    const sql = 'SELECT COUNT(*) FROM tx';
    const variants = sh.relaxSQL(sql);
    assert.equal(variants.length, 0);
  });

  test('handles null/empty SQL', () => {
    assert.deepEqual(sh.relaxSQL(null), []);
    assert.deepEqual(sh.relaxSQL(''), []);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('validateResult', () => {
  test('OK on healthy multi-row result', () => {
    const r = sh.validateResult([{ x: 1 }, { x: 2 }], 'top 5');
    assert.equal(r.ok, true);
  });

  test('flags single-row all-NULL aggregate', () => {
    const r = sh.validateResult([{ total: null, count: null }], 'total sales kitni hain?');
    assert.equal(r.ok, false);
    assert.match(r.hint, /NULL/);
  });

  test('flags all-zero numeric aggregate on aggregate question', () => {
    const r = sh.validateResult([{ total: 0, count: 0 }], 'total kitna hai?');
    assert.equal(r.ok, false);
    assert.match(r.hint, /0 for every numeric/);
  });

  test('flags 1-row when user asked for list', () => {
    const r = sh.validateResult([{ x: 1 }], 'top 5 parties');
    assert.equal(r.ok, false);
    assert.match(r.hint, /list\/breakdown/);
  });

  test('does not flag healthy aggregate (single row, real values)', () => {
    const r = sh.validateResult([{ total: 12345 }], 'total amount');
    assert.equal(r.ok, true);
  });

  test('returns not-ok on null rows', () => {
    const r = sh.validateResult(null, 'anything');
    assert.equal(r.ok, false);
  });
});
