/**
 * Unit tests for helpers/prompt.js
 * Tests system prompt generation, fallback behaviour, and message building.
 */
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { generateSystemPrompt, buildQueryMessages } =
  require('../../helpers/prompt');

const SAMPLE_TENANT = {
  name: 'TestCo',
  business_description: 'Wholesale electronics',
  schema_json: {
    row_count: 1234,
    columns: [
      { name: 'invoice_no', type: 'string',  samples: ['INV-001', 'INV-002'] },
      { name: 'amount',     type: 'number',  samples: ['1,000', '2,500'] },
      { name: 'date',       type: 'date',    samples: ['2026-05-26'] },
    ],
  },
};

// ─────────────────────── generateSystemPrompt ───────────────────────
describe('generateSystemPrompt', () => {
  test('full schema → full prompt with rules', () => {
    const p = generateSystemPrompt(SAMPLE_TENANT);
    assert.match(p, /TestCo/);
    assert.match(p, /Wholesale electronics/);
    assert.match(p, /1234/);
    assert.match(p, /invoice_no/);
    assert.match(p, /amount/);
    assert.match(p, /RULES/);
    assert.match(p, /English/);
  });

  test('includes column samples when present', () => {
    const p = generateSystemPrompt(SAMPLE_TENANT);
    assert.match(p, /INV-001/);
    assert.match(p, /1,000/);
  });

  test('missing schema → fallback prompt', () => {
    const t = { name: 'X', business_description: 'Test' };
    const p = generateSystemPrompt(t);
    assert.match(p, /helpful data assistant/);
    assert.match(p, /X/);
  });

  test('missing columns → fallback prompt', () => {
    const t = { name: 'Y', schema_json: { row_count: 0 } };
    const p = generateSystemPrompt(t);
    assert.match(p, /helpful data assistant/);
  });

  test('emphasizes English-only output', () => {
    const p = generateSystemPrompt(SAMPLE_TENANT);
    assert.match(p, /English/i);
    assert.match(p, /Hindi|Hinglish/i);
  });

  test('includes aggregation rules for multi-row queries', () => {
    const p = generateSystemPrompt(SAMPLE_TENANT);
    assert.match(p, /summary/i);
    assert.match(p, /unique entries|aggregate|TOTAL/i);
  });
});

// ─────────────────────── buildQueryMessages ───────────────────────
describe('buildQueryMessages', () => {
  test('returns array of system + user messages', () => {
    const m = buildQueryMessages(SAMPLE_TENANT, 'how much sales?', [{ amount: 100 }], 1);
    assert.ok(Array.isArray(m));
    assert.equal(m.length, 2);
    assert.equal(m[0].role, 'system');
    assert.equal(m[1].role, 'user');
  });

  test('user content includes the question', () => {
    const m = buildQueryMessages(SAMPLE_TENANT, 'TestQuestion', [], 0);
    assert.match(m[1].content, /TestQuestion/);
  });

  test('user content includes the data JSON', () => {
    const m = buildQueryMessages(SAMPLE_TENANT, 'q', [{ amount: 999 }], 1);
    assert.match(m[1].content, /999/);
  });

  test('truncates very long data payloads', () => {
    const huge = Array.from({ length: 50000 }, (_, i) => ({ id: i, value: 'x'.repeat(10) }));
    const m = buildQueryMessages(SAMPLE_TENANT, 'q', huge, huge.length);
    assert.match(m[1].content, /truncated/);
  });

  test('shows total/showing-only note when total > shown', () => {
    const m = buildQueryMessages(SAMPLE_TENANT, 'q', [{ a: 1 }], 5000);
    assert.match(m[1].content, /5000/);
    assert.match(m[1].content, /Total database/);
  });

  test('uses tenant.system_prompt override when provided', () => {
    const t = { ...SAMPLE_TENANT, system_prompt: 'CUSTOM_PROMPT_XYZ' };
    const m = buildQueryMessages(t, 'q', [], 0);
    assert.match(m[0].content, /CUSTOM_PROMPT_XYZ/);
  });

  test('renders empty rows array correctly', () => {
    const m = buildQueryMessages(SAMPLE_TENANT, 'q', [], 0);
    assert.equal(m[1].role, 'user');
    assert.match(m[1].content, /\(0 rows\)/);
  });
});
