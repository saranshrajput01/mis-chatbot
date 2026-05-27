/**
 * Google Sheets — Multi-Tab Schema Detector & Sync (Phase 6)
 * - syncSheetToProperTables: NEW. Syncs each tab to a real PostgreSQL table.
 * - syncSheetToSupabase: kept for backward compat (JSONB sync).
 * - detectSchema: discovers all tabs and per-column types/samples.
 */

const tt = require('./tenant-tables');
const selfHeal = require('./self-heal');  // Phase 10.2: detectSchemaDrift for rich logging

function extractSheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function extractGid(url) {
  const match = url.match(/gid=(\d+)/);
  return match ? match[1] : '0';
}

async function fetchSheetAsJSON(sheetId, gid = '0') {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  const csv = await res.text();
  return parseCSV(csv);
}

/**
 * Robust CSV parser — handles quoted fields containing commas and newlines.
 */
function parseCSV(csv) {
  const allRows = [];
  let cur = '', inQ = false, row = [];
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      // Check for escaped quote ""
      if (inQ && csv[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      row.push(cur); cur = '';
    } else if ((ch === '\n' || ch === '\r') && !inQ) {
      if (ch === '\r' && csv[i + 1] === '\n') i++; // CRLF
      row.push(cur); cur = '';
      if (row.some(c => String(c).length > 0)) allRows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur || row.length) { row.push(cur); if (row.some(c => String(c).length > 0)) allRows.push(row); }

  if (allRows.length < 2) return { headers: allRows[0] || [], rows: [] };
  const headers = allRows[0].map(h => String(h).trim());
  const rows = allRows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]) : ''; });
    return obj;
  });
  return { headers, rows };
}

/**
 * Discover all tabs with names + gids by scraping the htmlview page.
 */
async function discoverTabs(sheetId) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    const tabs = [];
    const regex = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"(\d+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) tabs.push({ name: match[1], gid: match[2] });
    if (tabs.length > 0) return tabs;

    // Fallback: extract gids without names
    const gidRegex = /gid=(\d+)/g;
    const gids = new Set();
    while ((match = gidRegex.exec(html)) !== null) gids.add(match[1]);
    if (gids.size === 0) gids.add('0');
    return [...gids].map((gid, i) => ({ name: `Sheet${i + 1}`, gid }));
  } catch (e) {
    return [{ name: 'Sheet1', gid: '0' }];
  }
}

/**
 * Detect per-tab schema (column names, types, samples).
 */
function detectTabSchema(headers, rows, tabName, gid) {
  const columns = headers.map(header => {
    const values = rows.map(r => r[header] || '');
    return {
      name: header,
      type: detectColumnTypeForUI(values),  // legacy hint for UI
      samples: values.filter(v => v && String(v).trim()).slice(0, 5),
    };
  });
  return { name: tabName, gid, row_count: rows.length, columns };
}

/**
 * Lightweight column type for the UI preview only — not used for actual table creation.
 */
function detectColumnTypeForUI(values) {
  const nonEmpty = values.filter(v => v && String(v).trim());
  if (!nonEmpty.length) return 'text';
  let n = 0, d = 0;
  for (const v of nonEmpty.slice(0, 20)) {
    if (tt.cleanNumeric(v) !== null) n++;
    else if (/^\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4}/.test(v) || /^\d{1,2}-[A-Z][a-z]{2}-\d{2}$/.test(v)) d++;
  }
  const total = Math.min(nonEmpty.length, 20);
  if (n / total > 0.6) return 'number';
  if (d / total > 0.6) return 'date';
  return 'text';
}

/**
 * Detect schema for ALL tabs.
 */
async function detectSchema(sheetUrl) {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) throw new Error('Invalid Google Sheet URL');

  const tabs = await discoverTabs(sheetId);
  const tables = [];

  for (const tab of tabs) {
    try {
      const { headers, rows } = await fetchSheetAsJSON(sheetId, tab.gid);
      if (!headers.length) continue;
      tables.push(detectTabSchema(headers, rows, tab.name, tab.gid));
    } catch (e) {
      console.log(`[SCHEMA] Tab ${tab.name} (gid=${tab.gid}) skipped: ${e.message}`);
    }
  }

  if (tables.length === 0) {
    const gid = extractGid(sheetUrl);
    const { headers, rows } = await fetchSheetAsJSON(sheetId, gid);
    tables.push(detectTabSchema(headers, rows, 'Sheet1', gid));
  }

  return {
    sheet_id: sheetId,
    tables,
    total_rows: tables.reduce((s, t) => s + t.row_count, 0),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// PHASE 6: PROPER-TABLES SYNC
// ─────────────────────────────────────────────────────────────────────────

/**
 * Sync all tabs of a sheet to dedicated PostgreSQL tables (one per tab).
 * Steps per tab:
 *   1. Fetch CSV
 *   2. Detect column types (NUMERIC/TEXT) from samples
 *   3. CREATE TABLE if missing, else ALTER TABLE ADD missing columns
 *   4. TRUNCATE table
 *   5. INSERT cleaned rows (numbers stripped of commas, NA → null, etc.)
 *
 * Updates tenants.tables_metadata with the per-table column metadata.
 *
 * @returns { synced_rows, tabs: [{name, pg_table, rows, columns, errors}], tables_metadata }
 */
async function syncSheetToProperTables(supabase, tenantId, sheetUrl) {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) throw new Error('Invalid Sheet URL');

  // Phase 10.2: load existing tables_metadata snapshot so we can detect type/role drift across syncs.
  let prevMetadataByPgTable = {};
  try {
    const { data: prevTenant } = await supabase
      .from('tenants').select('tables_metadata').eq('id', tenantId).single();
    for (const t of (prevTenant?.tables_metadata || [])) {
      prevMetadataByPgTable[t.pg_table] = t.columns || [];
    }
  } catch (_) { /* first-time sync — no previous snapshot */ }

  const tabs = await discoverTabs(sheetId);
  const result = { synced_rows: 0, tabs: [], tables_metadata: [], drift: [] };

  for (const tab of tabs) {
    try {
      const { headers, rows } = await fetchSheetAsJSON(sheetId, tab.gid);
      if (!rows.length) {
        console.log(`[SYNC P6] ${tab.name} (gid=${tab.gid}): empty, skipped`);
        continue;
      }

      // Build raw column descriptors (header + samples) for type detection
      const rawCols = headers.map(h => {
        const values = rows.map(r => r[h] || '').filter(v => v && String(v).trim());
        return { name: h, samples: values.slice(0, 30) };
      });

      const columnsMeta = tt.buildColumnMetadata(rawCols);
      if (!columnsMeta.length) {
        console.log(`[SYNC P6] ${tab.name}: no valid columns, skipped`);
        continue;
      }

      const pgTable = tt.buildTenantTableName(tenantId, tab.name);

      // Phase 10.2: BEFORE altering — compute schema drift for rich logging.
      // (ensureTable will then physically ALTER TABLE for `added` columns.
      // Removed columns are kept in the DB to preserve historical data; just logged.
      // Type drift is logged so a human can decide whether to drop+recreate.)
      let drift = null;
      try {
        const tableExists = await tt.tableExists(supabase, pgTable);
        if (tableExists) {
          const pgColumns = await tt.getExistingColumns(supabase, pgTable);
          drift = selfHeal.detectSchemaDrift(pgColumns, columnsMeta, prevMetadataByPgTable[pgTable]);
          if (drift.added.length || drift.removed.length || drift.typeChanged.length) {
            console.log(`[SCHEMA-DRIFT] ${tab.name} → ${pgTable}: ${drift.summary}`);
            if (drift.added.length)       console.log('  + added:',       drift.added.map(c => `${c.name} (${c.type}/${c.role})`).join(', '));
            if (drift.removed.length)     console.log('  - removed:',     drift.removed.join(', '), '(kept in DB)');
            if (drift.typeChanged.length) console.log('  ~ type-drift:',  drift.typeChanged.map(c => `${c.name}: ${c.from} → ${c.to}`).join(', '));
          }
        } else {
          console.log(`[SCHEMA-DRIFT] ${tab.name} → ${pgTable}: NEW table (${columnsMeta.length} cols)`);
        }
      } catch (e) {
        console.log(`[SCHEMA-DRIFT] ${tab.name}: drift-check skipped (${e.message})`);
      }

      // Ensure table exists (create or alter — adds new cols only)
      await tt.ensureTable(supabase, pgTable, columnsMeta);

      // Full re-load: truncate then insert
      await tt.truncateTable(supabase, pgTable);

      const inserted = await tt.insertRows(supabase, pgTable, rows, columnsMeta);

      result.synced_rows += inserted;
      result.tabs.push({ name: tab.name, pg_table: pgTable, rows: inserted, gid: tab.gid, drift });
      if (drift && (drift.added.length || drift.removed.length || drift.typeChanged.length)) {
        result.drift.push({ tab: tab.name, pg_table: pgTable, ...drift });
      }
      result.tables_metadata.push({
        source_name: tab.name,
        pg_table: pgTable,
        gid: tab.gid,
        row_count: inserted,
        columns: columnsMeta,
      });
      console.log(`[SYNC P6] ${tab.name} → ${pgTable}: ${inserted}/${rows.length} rows`);
    } catch (e) {
      console.error(`[SYNC P6] ${tab.name} FAILED: ${e.message}`);
      result.tabs.push({ name: tab.name, gid: tab.gid, error: e.message, rows: 0 });
    }
  }

  // Persist metadata + flag on tenants
  await supabase
    .from('tenants')
    .update({
      tables_metadata: result.tables_metadata,
      proper_tables_created: result.tables_metadata.length > 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tenantId);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// LEGACY: JSONB SYNC (kept for backward compat / fallback)
// ─────────────────────────────────────────────────────────────────────────
async function syncSheetToSupabase(supabase, tenantId, sheetUrl) {
  const sheetId = extractSheetId(sheetUrl);
  if (!sheetId) throw new Error('Invalid Sheet URL');

  const tabs = await discoverTabs(sheetId);
  await supabase.from('tenant_data').delete().eq('tenant_id', tenantId);

  let totalSynced = 0;
  const syncedTabs = [];

  for (const tab of tabs) {
    try {
      const { headers, rows } = await fetchSheetAsJSON(sheetId, tab.gid);
      if (!rows.length) continue;
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map((row, idx) => ({
          tenant_id: tenantId,
          sheet_name: `${tab.name}_gid${tab.gid}`,
          table_name: tab.name,
          row_index: totalSynced + i + idx,
          row_data: row,
        }));
        await supabase.from('tenant_data').insert(batch);
      }
      totalSynced += rows.length;
      syncedTabs.push({ name: tab.name, rows: rows.length });
      console.log(`[TENANT SYNC LEGACY] ${tab.name} (gid=${tab.gid}): ${rows.length} rows`);
    } catch (e) {
      console.log(`[TENANT SYNC LEGACY] ${tab.name} skipped: ${e.message}`);
    }
  }
  return { synced_rows: totalSynced, tabs: syncedTabs };
}

module.exports = {
  extractSheetId,
  detectSchema,
  syncSheetToSupabase,        // legacy JSONB
  syncSheetToProperTables,    // NEW Phase 6
  fetchSheetAsJSON,
  discoverTabs,
  parseCSV,
};
