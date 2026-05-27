/**
 * Unit tests for helpers/tenant-router.js pure helpers.
 * These cover the regex-driven branching that decides how a tenant query
 * is routed (intent → mode → entity filters → SQL validation).
 *
 * Run: npm test
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { _internal } = require('../../helpers/tenant-router');
const { detectIntent, detectQueryMode, autoRouteQuery, extractEntityFilters, validateSQL } = _internal;

// ────────────────────────────────────────────────────────────────────────
describe('detectIntent', () => {
  test('greetings return GREETING with reply', () => {
    for (const q of ['hi', 'hello', 'namaste', 'good morning', 'Hii!']) {
      const r = detectIntent(q);
      assert.equal(r.intent, 'GREETING', `'${q}' should be GREETING`);
      assert.ok(r.greeting_reply);
    }
  });

  test('thanks/bye return GREETING', () => {
    for (const q of ['thanks', 'bye', 'shukriya', 'tata']) {
      const r = detectIntent(q);
      assert.equal(r.intent, 'GREETING', `'${q}' should be GREETING`);
    }
  });

  test('chit-chat returns IGNORE', () => {
    for (const q of ['hmm', 'kaise ho', 'how are you', 'theek']) {
      const r = detectIntent(q);
      assert.equal(r.intent, 'IGNORE', `'${q}' should be IGNORE`);
    }
  });

  test('very short non-numeric returns CLARIFY_NEEDED', () => {
    assert.equal(detectIntent('a').intent, 'CLARIFY_NEEDED');
    assert.equal(detectIntent('xy').intent, 'CLARIFY_NEEDED');
  });

  test('digit-only returns DB_SELECT with parsed choice', () => {
    const r = detectIntent('3');
    assert.equal(r.intent, 'DB_SELECT');
    assert.equal(r.choice, 3);
  });

  test('"switch db" returns SWITCH_DB', () => {
    for (const q of ['switch', 'switch db', 'change database', 'badlo db']) {
      assert.equal(detectIntent(q).intent, 'SWITCH_DB', `'${q}'`);
    }
  });

  test('real questions return DATA_QUERY', () => {
    for (const q of ['top 5 parties', '18 April invoices kitne the', 'total sales']) {
      assert.equal(detectIntent(q).intent, 'DATA_QUERY', `'${q}'`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('detectQueryMode', () => {
  test('chart keywords → chart', () => {
    for (const q of ['monthly sales chart', 'pie chart batao', 'line graph']) {
      assert.equal(detectQueryMode(q), 'chart', `'${q}'`);
    }
  });

  test('image/photo keywords → images', () => {
    for (const q of ['Foundation Bolt ka photo', 'send images', 'photo dikhao', 'tasveer bhejo']) {
      assert.equal(detectQueryMode(q), 'images', `'${q}'`);
    }
  });

  test('pivot keyword → pivot', () => {
    assert.equal(detectQueryMode('month-wise pivot'), 'pivot');
  });

  test('ledger/khata keywords → ledger', () => {
    for (const q of ['Pansari ka ledger', 'khata batao', 'bahi nikalo']) {
      assert.equal(detectQueryMode(q), 'ledger', `'${q}'`);
    }
  });

  test('calendar keywords → calendar', () => {
    for (const q of ['aaj ki meetings', 'meeting book karo', 'cancel meeting']) {
      assert.equal(detectQueryMode(q), 'calendar', `'${q}'`);
    }
  });

  test('default → data', () => {
    assert.equal(detectQueryMode('total sales'), 'data');
    assert.equal(detectQueryMode('top 5 parties'), 'data');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('autoRouteQuery', () => {
  const dbs = [
    { id: 'a', name: 'Sales DB', alias: 'Sales', tables_metadata: [{ source_name: 'Invoices' }] },
    { id: 'b', name: 'Inventory DB', alias: 'Inventory', tables_metadata: [{ source_name: 'Stock' }] },
  ];

  test('matches by db alias prefix', () => {
    const r = autoRouteQuery('sales total kitna hai', dbs);
    assert.equal(r?.id, 'a');
  });

  test('matches by table name when no db match', () => {
    const r = autoRouteQuery('stock kitna hai', dbs);
    assert.equal(r?.id, 'b');
  });

  test('returns null when no match', () => {
    const r = autoRouteQuery('random nothing', dbs);
    assert.equal(r, null);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('extractEntityFilters', () => {
  const tablesMetadata = [
    {
      pg_table: 'tenant_xx_sales',
      columns: [
        { pg_name: 'party_name', role: 'entity' },
        { pg_name: 'amount',     role: 'currency' },
        { pg_name: 'city',       role: 'location' },
      ],
    },
  ];

  test('extracts ILIKE on entity column', () => {
    const sql = "SELECT * FROM tenant_xx_sales WHERE party_name ILIKE '%Pansari%'";
    const filters = extractEntityFilters(sql, tablesMetadata);
    assert.equal(filters.length, 1);
    assert.equal(filters[0].pgColumn, 'party_name');
    assert.equal(filters[0].value, 'Pansari');
  });

  test('extracts ILIKE on location column too', () => {
    const sql = "SELECT * FROM tenant_xx_sales WHERE city ILIKE '%Delhi%'";
    const filters = extractEntityFilters(sql, tablesMetadata);
    assert.equal(filters.length, 1);
    assert.equal(filters[0].pgColumn, 'city');
  });

  test('skips ILIKE on non-entity columns (numeric/currency)', () => {
    const sql = "SELECT * FROM tenant_xx_sales WHERE amount ILIKE '%100%'"; // unlikely but simulates AI mistake
    const filters = extractEntityFilters(sql, tablesMetadata);
    assert.equal(filters.length, 0);
  });

  test('returns empty array on no metadata', () => {
    const sql = "SELECT * FROM tx WHERE party_name ILIKE '%X%'";
    assert.deepEqual(extractEntityFilters(sql, []), []);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('validateSQL', () => {
  test('accepts simple SELECT', () => {
    const r = validateSQL('SELECT * FROM tx');
    assert.equal(r.ok, true);
  });

  test('rejects non-SELECT', () => {
    assert.equal(validateSQL('UPDATE tx SET a=1').ok, false);
    assert.equal(validateSQL('DELETE FROM tx').ok, false);
    assert.equal(validateSQL('DROP TABLE tx').ok, false);
  });

  test('rejects empty SQL', () => {
    assert.equal(validateSQL('').ok, false);
    assert.equal(validateSQL(null).ok, false);
  });

  test('rejects multiple statements', () => {
    const r = validateSQL('SELECT 1; SELECT 2');
    assert.equal(r.ok, false);
    assert.match(r.error, /Multiple statements/);
  });

  test('accepts SELECT with trailing semicolon (single statement)', () => {
    // The validator allows a trailing `;` if nothing follows
    assert.equal(validateSQL('SELECT 1;').ok, true);
  });

  test('rejects DDL keywords', () => {
    assert.equal(validateSQL('SELECT 1; INSERT INTO x VALUES(1)').ok, false);
  });
});
