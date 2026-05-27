/**
 * Integration tests against the live PM2 server.
 *
 * Skipped automatically if server is unreachable (so unit tests still pass
 * in CI without a running server).
 *
 * Run: npm test
 */
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
let serverUp = false;

before(async () => {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2500) });
    serverUp = r.ok || r.status === 503; // 503 still means server is reachable
  } catch (_) {
    serverUp = false;
  }
});

// ────────────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns ok + db latency', async (t) => {
    if (!serverUp) return t.skip('server not reachable');
    const r = await fetch(`${BASE}/health`);
    assert.ok(r.status === 200 || r.status === 503, `status was ${r.status}`);
    const body = await r.json();
    assert.ok(['ok', 'degraded'].includes(body.status), `status: ${body.status}`);
    assert.ok(typeof body.uptime === 'number');
    assert.ok(body.db && typeof body.db.ok === 'boolean');
    assert.ok(typeof body.db.latency_ms === 'number');
    assert.ok(body.timestamp);
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('GET /sync/status', () => {
  test('returns array (may be empty)', async (t) => {
    if (!serverUp) return t.skip('server not reachable');
    const r = await fetch(`${BASE}/sync/status`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body));
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('POST /api/tenant/sync-all', () => {
  test('rejects without auth', async (t) => {
    if (!serverUp) return t.skip('server not reachable');
    const r = await fetch(`${BASE}/api/tenant/sync-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.ok([401, 403].includes(r.status), `expected 401/403 got ${r.status}`);
  });

  test('accepts with auth + returns ok envelope', async (t) => {
    if (!serverUp) return t.skip('server not reachable');
    const key = process.env.ADMIN_API_KEY;
    if (!key) return t.skip('ADMIN_API_KEY not set in env');
    const r = await fetch(`${BASE}/api/tenant/sync-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: '{}',
      signal: AbortSignal.timeout(120 * 1000), // sync can be slow
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.tenants));
  });
});

// ────────────────────────────────────────────────────────────────────────
describe('POST /whatsapp', () => {
  test('handles empty body gracefully', async (t) => {
    if (!serverUp) return t.skip('server not reachable');
    const r = await fetch(`${BASE}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.success, true);
  });

  test('returns 400 on malformed JSON, no stack trace leak', async (t) => {
    if (!serverUp) return t.skip('server not reachable');
    const r = await fetch(`${BASE}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    assert.equal(r.status, 400);
    const text = await r.text();
    assert.doesNotMatch(text, /\/Users\//, 'should not leak file paths');
    assert.doesNotMatch(text, /node_modules/, 'should not leak module paths');
  });
});
