/**
 * Tenant Auto-Sync — Phase 9.2
 *
 * Periodically syncs every tenant's Google Sheet → Postgres tables.
 * Runs serially (not in parallel) so we don't hammer Google or Supabase
 * with concurrent requests. Each tenant is fully synced before the next.
 *
 * Behavior:
 *   - Only syncs tenants where proper_tables_created=true and sheet_url is set
 *   - Skips tenants with status='paused' or 'cancelled'
 *   - Logs row counts + drift events per tenant
 *   - Silent on success — only WhatsApp-notifies on schema drift OR errors
 *   - Catches errors per-tenant — one tenant's failure never blocks others
 *
 * Why per-tenant notification only on drift:
 *   - Sheet is unchanged 95% of the time → no point in spamming "synced" every 15 min.
 *   - When a column is added or row counts swing wildly, that's worth telling the owner.
 */
'use strict';

const { syncSheetToProperTables } = require('./sheets');

// In-memory throttle: don't double-sync the same tenant within this window
// even if the cron fires twice or someone hits a manual trigger right after.
const lastSyncedAt = new Map(); // tenant_id → ts
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 min

let syncRunning = false; // serialize cron firings — second tick waits or skips

/**
 * Sync ALL eligible tenants serially.
 * Safe to call from setInterval, /api/tenant/sync-all, or boot warm-up.
 *
 * @returns {Promise<{ tenants: Array<{tenantId, name, ok, rows?, drift?, error?}>, durationMs }>}
 */
async function syncAllTenants(supabase, opts = {}) {
  if (syncRunning) {
    console.log('[TENANT-SYNC] Already running — skipping this tick');
    return { tenants: [], durationMs: 0, skipped: true };
  }
  syncRunning = true;
  const start = Date.now();
  const results = [];

  try {
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, name, phone, sheet_url, status, proper_tables_created')
      .eq('proper_tables_created', true)
      .neq('status', 'paused')
      .neq('status', 'cancelled');

    if (error) {
      console.error('[TENANT-SYNC] List error:', error.message);
      return { tenants: [], durationMs: Date.now() - start, error: error.message };
    }
    if (!tenants?.length) {
      return { tenants: [], durationMs: Date.now() - start };
    }

    console.log(`[TENANT-SYNC] Starting sync for ${tenants.length} tenant(s)`);

    for (const t of tenants) {
      // Throttle — skip if synced recently
      const last = lastSyncedAt.get(t.id);
      if (last && Date.now() - last < MIN_SYNC_INTERVAL_MS && !opts.force) {
        console.log(`[TENANT-SYNC] ${t.name}: throttled (last synced ${Math.round((Date.now() - last) / 1000)}s ago)`);
        results.push({ tenantId: t.id, name: t.name, ok: true, skipped: 'throttled' });
        continue;
      }

      if (!t.sheet_url) {
        results.push({ tenantId: t.id, name: t.name, ok: false, error: 'no sheet_url' });
        continue;
      }

      const tStart = Date.now();
      try {
        const r = await syncSheetToProperTables(supabase, t.id, t.sheet_url);
        lastSyncedAt.set(t.id, Date.now());

        // Drift summary — how many new/removed columns this run?
        const totalDriftEvents = (r.drift || []).reduce(
          (n, d) => n + (d.added?.length || 0) + (d.removed?.length || 0) + (d.typeChanged?.length || 0),
          0
        );

        const summary = {
          tenantId: t.id,
          name: t.name,
          phone: t.phone,
          ok: true,
          totalRows: r.synced_rows,
          tabs: (r.tabs || []).length,
          drift: r.drift || [],
          driftEvents: totalDriftEvents,
          durationMs: Date.now() - tStart,
        };
        results.push(summary);
        console.log(`[TENANT-SYNC] ✓ ${t.name}: ${r.synced_rows} rows, ${(r.tabs || []).length} tabs, ${totalDriftEvents} drift events (${summary.durationMs}ms)`);

        // Optional: WhatsApp-notify owner on schema drift (column added/removed)
        if (totalDriftEvents > 0 && opts.sendWhatsAppReply && t.phone) {
          try {
            const driftMsg = buildDriftMessage(t.name, r.drift);
            await opts.sendWhatsAppReply(t.phone, driftMsg);
          } catch (e) { console.error('[TENANT-SYNC] notify error:', e.message); }
        }
      } catch (e) {
        console.error(`[TENANT-SYNC] ✗ ${t.name}: ${e.message}`);
        results.push({
          tenantId: t.id,
          name: t.name,
          ok: false,
          error: e.message,
          durationMs: Date.now() - tStart,
        });
      }
    }

    return { tenants: results, durationMs: Date.now() - start };
  } finally {
    syncRunning = false;
  }
}

/**
 * Build a friendly English WhatsApp message about schema drift.
 */
function buildDriftMessage(tenantName, drift) {
  const lines = [`🔄 *Sheet Sync* — ${tenantName}`, ''];
  for (const d of drift) {
    const tabName = d.tab || d.pg_table;
    if (d.added?.length) {
      lines.push(`📥 *${tabName}*: ${d.added.length} new column${d.added.length === 1 ? '' : 's'} added`);
      lines.push(`   ${d.added.map(c => c.name).join(', ')}`);
    }
    if (d.removed?.length) {
      lines.push(`📤 *${tabName}*: ${d.removed.length} column${d.removed.length === 1 ? '' : 's'} removed (data preserved)`);
      lines.push(`   ${d.removed.join(', ')}`);
    }
    if (d.typeChanged?.length) {
      lines.push(`🔧 *${tabName}*: ${d.typeChanged.length} type change${d.typeChanged.length === 1 ? '' : 's'}`);
      lines.push(`   ${d.typeChanged.map(c => `${c.name} (${c.from} → ${c.to})`).join(', ')}`);
    }
  }
  lines.push('', '_You can now use the new columns in your queries._');
  return lines.join('\n');
}

/**
 * Mark a single tenant for immediate sync on next run (clears throttle).
 * Useful when admin re-imports a sheet via the dashboard.
 */
function clearSyncThrottle(tenantId) {
  lastSyncedAt.delete(tenantId);
}

module.exports = {
  syncAllTenants,
  clearSyncThrottle,
  buildDriftMessage,
};
