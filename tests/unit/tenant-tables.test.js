/**
 * Unit tests for helpers/tenant-tables.js — Phase 6 schema/type/cleaning.
 * All pure functions (no DB).
 *
 * Run: npm test
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const tt = require('../../helpers/tenant-tables');

// ────────────────────────────────────────────────────────────────────────
describe('sanitizeIdentifier', () => {
  test('lowercases + snake-cases', () => {
    assert.equal(tt.sanitizeIdentifier('Party Name'), 'party_name');
    assert.equal(tt.sanitizeIdentifier('CompanyName'), 'companyname');
    assert.equal(tt.sanitizeIdentifier('With GST Amount'), 'with_gst_amount');
  });

  test('strips special chars', () => {
    assert.equal(tt.sanitizeIdentifier('amount(₹)'), 'amount');
    assert.equal(tt.sanitizeIdentifier('S.No.'), 's_no');
  });

  test('prefixes digit-leading', () => {
    assert.equal(tt.sanitizeIdentifier('1st_quarter'), 'c_1st_quarter');
  });

  test('prefixes reserved words', () => {
    assert.equal(tt.sanitizeIdentifier('date'), 'c_date');
    assert.equal(tt.sanitizeIdentifier('user'), 'c_user');
  });

  test('caps at 50 chars', () => {
    const long = 'a'.repeat(80);
    assert.ok(tt.sanitizeIdentifier(long).length <= 50);
  });

  test('returns "col" on empty / null', () => {
    assert.equal(tt.sanitizeIdentifier(''), 'col');
    assert.equal(tt.sanitizeIdentifier(null), 'col');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('buildTenantTableName', () => {
  test('combines tenantId short + sanitized table', () => {
    const name = tt.buildTenantTableName('ec50657e-23d4-456e-8f3c-e7209f1e9055', 'SALES');
    assert.equal(name, 'tenant_ec50657e_sales');
  });

  test('respects 60-char limit', () => {
    const long = 'A'.repeat(80);
    const name = tt.buildTenantTableName('abcdef-1234', long);
    assert.ok(name.length <= 60);
    assert.match(name, /^tenant_/);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('cleanNumeric', () => {
  test('plain numbers', () => {
    assert.equal(tt.cleanNumeric('123'), 123);
    assert.equal(tt.cleanNumeric('123.45'), 123.45);
    assert.equal(tt.cleanNumeric(456), 456);
  });

  test('Indian commas', () => {
    assert.equal(tt.cleanNumeric('1,23,456.78'), 123456.78);
    assert.equal(tt.cleanNumeric('10,000'), 10000);
  });

  test('(-)X format → negative', () => {
    assert.equal(tt.cleanNumeric('(-)0.40'), -0.4);
    assert.equal(tt.cleanNumeric('(-)1,234'), -1234);
  });

  test('parens accounting → negative', () => {
    assert.equal(tt.cleanNumeric('(123)'), -123);
    assert.equal(tt.cleanNumeric('(1,234.5)'), -1234.5);
  });

  test('strips currency symbols', () => {
    assert.equal(tt.cleanNumeric('₹1,234'), 1234);
    assert.equal(tt.cleanNumeric('$1234'), 1234);
  });

  test('NULL tokens → null', () => {
    for (const v of ['', 'NA', 'na', 'N/A', '-', 'null', '#N/A', '#DIV/0!']) {
      assert.equal(tt.cleanNumeric(v), null, `'${v}' should be null`);
    }
  });

  test('non-numeric strings → null', () => {
    assert.equal(tt.cleanNumeric('hello'), null);
    assert.equal(tt.cleanNumeric('abc123xyz'), null);
  });

  test('null/undefined → null', () => {
    assert.equal(tt.cleanNumeric(null), null);
    assert.equal(tt.cleanNumeric(undefined), null);
  });

  test('percent sign stripped', () => {
    assert.equal(tt.cleanNumeric('12.5%'), 12.5);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('cleanText', () => {
  test('trims whitespace', () => {
    assert.equal(tt.cleanText('  hello  '), 'hello');
  });

  test('NA tokens → null', () => {
    assert.equal(tt.cleanText('NA'), null);
    assert.equal(tt.cleanText(''), null);
  });

  test('non-NA passes through', () => {
    assert.equal(tt.cleanText('Pansari Industries'), 'Pansari Industries');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('parseDate', () => {
  test('D-Mon-YY format', () => {
    const d = tt.parseDate('2-Apr-26');
    assert.ok(d instanceof Date);
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 3); // 0-indexed → April
    assert.equal(d.getUTCDate(), 2);
  });

  test('DD-Mon-YYYY format', () => {
    const d = tt.parseDate('11-May-2026');
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 4);
  });

  test('YYYY-MM-DD format', () => {
    const d = tt.parseDate('2026-04-15');
    assert.equal(d.getUTCFullYear(), 2026);
    assert.equal(d.getUTCMonth(), 3);
  });

  test('DD/MM/YYYY format', () => {
    const d = tt.parseDate('15/04/2026');
    assert.equal(d.getUTCMonth(), 3);
  });

  test('invalid → null', () => {
    assert.equal(tt.parseDate('hello'), null);
    assert.equal(tt.parseDate('NA'), null);
    assert.equal(tt.parseDate(''), null);
    assert.equal(tt.parseDate(null), null);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('detectPgType', () => {
  test('amount column with numeric samples → NUMERIC', () => {
    assert.equal(tt.detectPgType('amount', ['123.45', '67.89', '1,000']), 'NUMERIC');
  });

  test('voucher number with mixed → TEXT (id-like)', () => {
    assert.equal(tt.detectPgType('voucher_no', ['1/2026-27', '2/2026-27']), 'TEXT');
  });

  test('date column → TEXT', () => {
    assert.equal(tt.detectPgType('c_date', ['2-Apr-26', '11-May-26']), 'TEXT');
  });

  test('hsn_code → TEXT (id-like even with numeric samples)', () => {
    assert.equal(tt.detectPgType('hsncode', ['72085210', '72085220']), 'TEXT');
  });

  test('qty column with numeric samples → NUMERIC', () => {
    assert.equal(tt.detectPgType('qty', ['100', '250', '1,500']), 'NUMERIC');
  });

  test('column with no samples — uses name hint', () => {
    assert.equal(tt.detectPgType('total_amount', []), 'NUMERIC');
    assert.equal(tt.detectPgType('party_name', []), 'TEXT');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('detectColumnRole', () => {
  test('voucher_numbe → id', () => {
    assert.equal(tt.detectColumnRole('voucher_numbe', 'TEXT'), 'id');
  });

  test('amount → currency', () => {
    assert.equal(tt.detectColumnRole('amount', 'NUMERIC'), 'currency');
    assert.equal(tt.detectColumnRole('with_gst_amount', 'NUMERIC'), 'currency');
  });

  test('qty → quantity', () => {
    assert.equal(tt.detectColumnRole('qty', 'NUMERIC'), 'quantity');
    assert.equal(tt.detectColumnRole('weight', 'NUMERIC'), 'quantity');
  });

  test('party_name → entity', () => {
    assert.equal(tt.detectColumnRole('party_name', 'TEXT'), 'entity');
    assert.equal(tt.detectColumnRole('sales_person_name', 'TEXT'), 'entity');
  });

  test('city → location', () => {
    assert.equal(tt.detectColumnRole('city', 'TEXT'), 'location');
    assert.equal(tt.detectColumnRole('state', 'TEXT'), 'location');
  });

  test('c_date with date sample → date', () => {
    assert.equal(tt.detectColumnRole('c_date', 'TEXT', ['2-Apr-26']), 'date');
  });

  test('invtype → category', () => {
    assert.equal(tt.detectColumnRole('invtype', 'TEXT'), 'category');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('titleCase', () => {
  test('SONEPAT → Sonepat', () => {
    assert.equal(tt.titleCase('SONEPAT'), 'Sonepat');
    assert.equal(tt.titleCase('sonepat'), 'Sonepat');
  });

  test('multi-word', () => {
    assert.equal(tt.titleCase('NEW YORK'), 'New York');
  });

  test('passes through non-strings', () => {
    assert.equal(tt.titleCase(null), null);
    assert.equal(tt.titleCase(123), 123);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('cleanValue (per type)', () => {
  test('NUMERIC type calls cleanNumeric', () => {
    assert.equal(tt.cleanValue('1,234', 'NUMERIC', 'currency'), 1234);
    assert.equal(tt.cleanValue('NA', 'NUMERIC', 'currency'), null);
  });

  test('TEXT location → titleCase', () => {
    assert.equal(tt.cleanValue('SONEPAT', 'TEXT', 'location'), 'Sonepat');
  });

  test('TEXT entity → trimmed but preserved case', () => {
    assert.equal(tt.cleanValue('  Pansari Industries  ', 'TEXT', 'entity'), 'Pansari Industries');
  });

  test('NULL tokens → null on TEXT too', () => {
    assert.equal(tt.cleanValue('NA', 'TEXT', 'entity'), null);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('buildColumnMetadata', () => {
  test('builds metadata with companion DATE column for date roles', () => {
    const raw = [
      { name: 'Party_Name', samples: ['Pansari'] },
      { name: 'Amount', samples: ['1,234', '5,678'] },
      { name: 'C_Date', samples: ['2-Apr-26'] },
    ];
    const meta = tt.buildColumnMetadata(raw);
    const names = meta.map(c => c.pg_name);
    assert.ok(names.includes('amount'));
    assert.ok(names.includes('c_date'));
    // Companion date column auto-added
    assert.ok(names.includes('c_date_actual'), 'date columns should get _actual companion');
    const cDateActual = meta.find(c => c.pg_name === 'c_date_actual');
    assert.equal(cDateActual.pg_type, 'DATE');
  });

  test('skips empty + URL-shaped headers', () => {
    const raw = [
      { name: '', samples: [] },
      { name: 'http://example.com/junk', samples: [] },
      { name: 'Real Col', samples: ['x'] },
    ];
    const meta = tt.buildColumnMetadata(raw);
    assert.equal(meta.length, 1);
    assert.equal(meta[0].pg_name, 'real_col');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('DDL builders', () => {
  test('buildCreateTableSQL emits CREATE TABLE IF NOT EXISTS', () => {
    const cols = [
      { pg_name: 'party_name', pg_type: 'TEXT' },
      { pg_name: 'amount',     pg_type: 'NUMERIC' },
    ];
    const sql = tt.buildCreateTableSQL('tenant_xx_sales', cols);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS/i);
    assert.match(sql, /"tenant_xx_sales"/);
    assert.match(sql, /"party_name" TEXT/);
    assert.match(sql, /"amount" NUMERIC/);
  });

  test('buildAlterAddColumnSQL emits ADD COLUMN IF NOT EXISTS', () => {
    const sqls = tt.buildAlterAddColumnSQL('tenant_xx_sales', [
      { pg_name: 'new_col', pg_type: 'TEXT' },
    ]);
    assert.equal(sqls.length, 1);
    assert.match(sqls[0], /ALTER TABLE "tenant_xx_sales" ADD COLUMN IF NOT EXISTS "new_col" TEXT/);
  });
});
