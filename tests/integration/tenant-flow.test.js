/**
 * End-to-end tenant flow tests against the MIS-2 tenant.
 *
 * These tests:
 *   - Need SUPABASE_URL, SUPABASE_SERVICE_KEY, and OPENAI_API_KEY in env
 *   - Hit the real OpenAI API (so cost ~$0.01 per run)
 *   - Are skipped if env vars are missing
 *
 * Set RUN_INTEGRATION=1 to enable; otherwise these are skipped to keep
 * `npm test` fast and free for unit-test-only runs.
 *
 * Run: RUN_INTEGRATION=1 npm test
 */
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('dotenv').config();

const RUN  = process.env.RUN_INTEGRATION === '1';
const HAS_KEYS = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY && process.env.OPENAI_API_KEY;
const PHONE     = '918750285420';
const TENANT_ID = 'ec50657e-23d4-456e-8f3c-e7209f1e9055'; // MIS-2

// Manage .db_selections.json so handleTenantQuery routes to MIS-2 instead of MIS Main
const SEL_PATH = path.join(__dirname, '..', '..', '.db_selections.json');
let originalSelection = null;

let supabase, tr;

before(async (t) => {
  if (!RUN || !HAS_KEYS) {
    return; // tests will skip individually
  }
  // Pre-set the DB selection BEFORE requiring tenant-router (it reads the file at require time)
  originalSelection = JSON.parse(fs.readFileSync(SEL_PATH, 'utf8'));
  fs.writeFileSync(SEL_PATH, JSON.stringify({ ...originalSelection, [PHONE]: TENANT_ID }));

  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  tr = require('../../helpers/tenant-router');
});

after(() => {
  if (originalSelection) {
    fs.writeFileSync(SEL_PATH, JSON.stringify(originalSelection));
  }
});

function shouldSkip(t) {
  if (!RUN) { t.skip('RUN_INTEGRATION not set'); return true; }
  if (!HAS_KEYS) { t.skip('SUPABASE_URL / SUPABASE_SERVICE_KEY / OPENAI_API_KEY missing'); return true; }
  return false;
}

async function ask(query) {
  tr.invalidateTenantCache(PHONE);
  return await tr.handleTenantQuery(supabase, PHONE, query);
}

// ────────────────────────────────────────────────────────────────────────
describe('Tenant baseline queries (MIS-2)', () => {
  test('counts April 18 invoices', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;
    const r = await ask('18 April invoices kitne the?');
    assert.ok(r?.reply, 'should have reply');
    assert.match(r.reply, /\d/, 'reply should contain a number');
  });

  test('top 5 parties by amount returns multi-row list', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;
    const r = await ask('top 5 parties by total amount');
    assert.ok(r?.reply);
    // Should have 5 numbered lines (1️⃣ ... 5️⃣) or similar
    assert.match(r.reply, /5/, 'reply should mention 5 results');
    assert.match(r.reply, /Cr|L|₹/, 'reply should contain currency');
  });

  test('total sales WITH GST aggregate', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;
    const r = await ask('total sales WITH GST kitni hai?');
    assert.ok(r?.reply);
    assert.match(r.reply, /₹/, 'should format as currency');
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('Tenant self-heal recovery (MIS-2)', () => {
  test('typo "Mital Electronicss" gets fuzzy-matched', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;
    const r = await ask('Mital Electronicss ki sales batao');
    assert.ok(r?.reply);
    // Either fuzzy suggests MITTAL ELECTRONICS, or returns the data directly
    assert.match(r.reply, /MITTAL|Mittal/i, 'should reference MITTAL ELECTRONICS');
  });

  test('typo "jeet contruction" gets matched', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;
    const r = await ask('jeet contruction ka data bhejo');
    assert.ok(r?.reply);
    assert.match(r.reply, /Jeet|jeet/i);
  });

  test('all-NULL aggregate is rerouted (not "Total: ₹0.00")', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;
    // Saga Stainox + August 2024 — that month has no data
    const r = await ask('August 2024 mein Saga Stainox ki sales kya thi?');
    assert.ok(r?.reply);
    // Either fuzzy suggests "Saga Stainox Private Limited" OR friendly no-data message — both are correct.
    // What we MUST NOT see is "₹0" or "Total: 0" since validation+reroute should catch that.
    assert.doesNotMatch(r.reply, /Total.*₹\s*0\b/, 'should not return misleading ₹0 total');
  });

  test('non-data chit-chat ignored', { timeout: 15000 }, async (t) => {
    if (shouldSkip(t)) return;
    const r = await ask('hmm');
    // detectIntent → IGNORE → silent (null reply)
    if (r) {
      assert.ok(r.silent || !r.reply, `expected silent ignore, got: ${r.reply}`);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('Chat history logging (Phase 9.3)', () => {
  test('tenant_query_logs.response is populated', { timeout: 30000 }, async (t) => {
    if (shouldSkip(t)) return;

    const r = await ask('total invoice count?');
    assert.ok(r?.reply);

    // Allow fire-and-forget insert to land
    await new Promise(res => setTimeout(res, 1500));

    const { data: latest } = await supabase
      .from('tenant_query_logs')
      .select('query, sql_generated, response')
      .eq('tenant_id', TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(1);

    assert.ok(latest?.length, 'should have at least one log row');
    assert.ok(latest[0].query, 'query field set');
    assert.ok(latest[0].sql_generated, 'sql_generated field set');
    assert.ok(latest[0].response, 'response field set (Phase 9.3)');
  });
});
