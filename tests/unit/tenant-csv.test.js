/**
 * Unit tests for helpers/tenant-csv.js
 * Tests pure RFC-4180 CSV escape, filename safety, header building,
 * + actual file generation against tmpdir.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const tcsv = require('../../helpers/tenant-csv');
const { generateTenantCSV, buildCsvSummary } = tcsv;

// helpers/tenant-csv.js exports only generateTenantCSV + buildCsvSummary publicly,
// but the cell-escape and safeName helpers are useful to test directly.
// We re-require through Module._exports to access them only for tests.
// Since they're internal, we test them indirectly via generateTenantCSV output.

// ─────────────────────── generateTenantCSV: smoke ───────────────────────
describe('generateTenantCSV', () => {
  test('rejects empty rows', async () => {
    await assert.rejects(() => generateTenantCSV([]), /No rows/);
    await assert.rejects(() => generateTenantCSV(null), /No rows/);
  });

  test('writes a valid CSV to tmpdir', async () => {
    const rows = [
      { customer: 'ACME Ltd', amount: 1000, city: 'Delhi' },
      { customer: 'Globex',   amount: 2500, city: 'Mumbai' },
    ];
    const filePath = await generateTenantCSV(rows, [], { title: 'sales', dbName: 'testdb' });
    try {
      assert.ok(fs.existsSync(filePath), 'file exists');
      assert.match(path.basename(filePath), /^testdb_sales_\d+\.csv$/);

      const content = fs.readFileSync(filePath, 'utf8');
      // BOM should be present
      assert.equal(content.charCodeAt(0), 0xFEFF);
      // Header line
      assert.match(content, /Customer,Amount,City/);
      // Data lines
      assert.match(content, /ACME Ltd,1000,Delhi/);
      assert.match(content, /Globex,2500,Mumbai/);
      // CRLF line endings (RFC 4180)
      assert.match(content, /\r\n/);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  test('escapes commas, quotes, newlines per RFC 4180', async () => {
    const rows = [
      { name: 'Smith, John',          note: 'Says "hello"' },
      { name: 'Multi\nline',          note: 'Carriage\rreturn' },
    ];
    const filePath = await generateTenantCSV(rows);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // commas trigger quoting
      assert.match(content, /"Smith, John"/);
      // internal quotes are doubled
      assert.match(content, /"Says ""hello"""/);
      // newlines + carriage returns trigger quoting
      assert.match(content, /"Multi\nline"/);
      assert.match(content, /"Carriage\rreturn"/);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  test('null/undefined cells become empty', async () => {
    const rows = [{ a: 'val', b: null, c: undefined }];
    const filePath = await generateTenantCSV(rows);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.replace(/^\uFEFF/, '').split('\r\n');
      // header + 1 row
      assert.equal(lines[1], 'val,,');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  test('numeric cells preserved as raw numbers (Excel-friendly)', async () => {
    const rows = [{ amount: 1234567.89 }];
    const filePath = await generateTenantCSV(rows);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      // No comma formatting, no ₹
      assert.match(content, /1234567\.89/);
      assert.notMatch(content, /₹/);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  test('non-finite numbers (Infinity/NaN) become empty', async () => {
    const rows = [{ inf: Infinity, nan: NaN }];
    const filePath = await generateTenantCSV(rows);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.replace(/^\uFEFF/, '').split('\r\n');
      assert.equal(lines[1], ',');
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  test('safe filename strips special chars', async () => {
    const rows = [{ a: 1 }];
    const filePath = await generateTenantCSV(rows, [], { title: 'My Report!@#$', dbName: 'tenant DB / 1' });
    try {
      const base = path.basename(filePath);
      // Special chars and spaces collapse to underscores
      assert.match(base, /^tenant_DB_1_My_Report.*\.csv$/);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  test('uses humanized labels from tableColumns', async () => {
    const rows  = [{ total_amount: 1000, customer_name: 'X' }];
    const cols  = [
      { pg_name: 'total_amount',  role: 'currency', original: 'Total Amount' },
      { pg_name: 'customer_name', role: 'entity',   original: 'Customer Name' },
    ];
    const filePath = await generateTenantCSV(rows, cols);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.match(content, /Total Amount/);
      assert.match(content, /Customer Name/);
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});

// ─────────────────────── buildCsvSummary ───────────────────────
describe('buildCsvSummary', () => {
  test('null/empty rows returns null', () => {
    assert.equal(buildCsvSummary(null), null);
    assert.equal(buildCsvSummary([]), null);
  });

  test('basic summary mentions count', () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const r = buildCsvSummary(rows);
    assert.match(r, /2 rows/);
  });

  test('summary computes totals on numeric columns', () => {
    const rows = [{ amount: 1000 }, { amount: 2000 }, { amount: 3000 }];
    const cols = [{ pg_name: 'amount', role: 'currency', original: 'Amount' }];
    const r = buildCsvSummary(rows, cols);
    assert.match(r, /Totals/);
    assert.match(r, /6,000|6000/);
  });

  test('skips non-numeric columns in summary', () => {
    const rows = [{ name: 'A' }, { name: 'B' }];
    const cols = [{ pg_name: 'name', role: 'entity', original: 'Name' }];
    const r = buildCsvSummary(rows, cols);
    assert.match(r, /2 rows/);
    assert.doesNotMatch(r, /Totals/);
  });
});
