// scripts/wipe-phone.js
// DESTRUCTIVE — wipes ALL data tied to a given phone number.
// Steps:
//   1. Backup local JSON files (timestamped)
//   2. Drop tenant's dynamic per-tenant tables (sales / purchases / etc.)
//   3. Delete tenant-scoped rows (chat_history, query_logs, calendar tokens, ...)
//   4. Delete tenant + tenant_phones + user_databases rows
//   5. Strip phone from access_control.json + .db_selections.json + .wp_sessions.json
//   6. Print verification summary
//
// Usage: node scripts/wipe-phone.js 919990930044

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const PHONE = process.argv[2];
if (!PHONE || !/^\d{10,15}$/.test(PHONE)) {
  console.error('Usage: node scripts/wipe-phone.js <PHONE_DIGITS_ONLY>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const root = path.join(__dirname, '..');
const TS = new Date().toISOString().replace(/[:.]/g, '-');

function backupFile(rel) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) { console.log(`  [backup] ${rel}: (not present, skipped)`); return; }
  const bak = path.join(root, `${rel}.bak-${TS}`);
  fs.copyFileSync(fp, bak);
  console.log(`  [backup] ${rel} → ${path.basename(bak)}`);
}

function stripPhoneFromJson(rel, phone) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) return false;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { console.log(`  [skip ${rel}] parse error: ${e.message}`); return false; }
  let changed = false;

  // Top-level allowed_numbers array (access_control.json)
  if (Array.isArray(raw.allowed_numbers)) {
    const before = raw.allowed_numbers.length;
    raw.allowed_numbers = raw.allowed_numbers.filter(p => String(p) !== phone);
    if (raw.allowed_numbers.length < before) { changed = true; console.log(`  [${rel}] removed from allowed_numbers`); }
  }
  if (raw.users && typeof raw.users === 'object' && phone in raw.users) {
    delete raw.users[phone]; changed = true;
    console.log(`  [${rel}] removed users["${phone}"]`);
  }
  // Flat dictionary (.db_selections.json, .wp_sessions.json)
  if (phone in raw && !Array.isArray(raw[phone])) {
    delete raw[phone]; changed = true;
    console.log(`  [${rel}] removed top-level key "${phone}"`);
  }
  if (changed) fs.writeFileSync(fp, JSON.stringify(raw, null, 2));
  else console.log(`  [${rel}] no changes`);
  return changed;
}

(async () => {
  console.log(`\n💥 WIPE phone: ${PHONE}\n${'═'.repeat(60)}`);

  // ── 1. Discover linked tenant_ids ──────────────────────────────
  const tenantIds = new Set();
  const { data: t1 } = await supabase.from('tenants').select('id').eq('phone', PHONE);
  (t1 || []).forEach(t => tenantIds.add(t.id));
  const { data: t2 } = await supabase.from('tenant_phones').select('tenant_id').eq('phone', PHONE);
  (t2 || []).forEach(t => t.tenant_id && tenantIds.add(t.tenant_id));
  const { data: t3 } = await supabase.from('user_databases').select('tenant_id').eq('phone', PHONE);
  (t3 || []).forEach(t => t.tenant_id && tenantIds.add(t.tenant_id));
  console.log(`\n[discover] tenant_ids found: ${tenantIds.size}`);
  for (const id of tenantIds) console.log(`           • ${id}`);

  // ── 2. Backup local JSON files ─────────────────────────────────
  console.log(`\n[2] Backing up local files (timestamp: ${TS})`);
  backupFile('access_control.json');
  backupFile('.db_selections.json');
  backupFile('.wp_sessions.json');

  // ── 3. Drop dynamic tenant_<short>_* tables ────────────────────
  console.log(`\n[3] Dropping dynamic per-tenant tables`);
  for (const id of tenantIds) {
    const short = id.replace(/-/g, '').slice(0, 8);
    const { data, error } = await supabase.rpc('tenant_drop_all_tables', { p_tenant_short: short });
    if (error) console.log(`    [${short}] ERROR: ${error.message}`);
    else      console.log(`    [${short}] dropped ${data} table(s)`);
  }

  // ── 4. Tenant-scoped row deletions ─────────────────────────────
  console.log(`\n[4] Deleting tenant-scoped rows`);
  if (tenantIds.size) {
    const ids = Array.from(tenantIds);
    const trySafeDelete = async (table, col, vals) => {
      const { error, count } = await supabase.from(table).delete({ count: 'exact' }).in(col, vals);
      if (error) console.log(`    [${table}] ERROR: ${error.message}`);
      else      console.log(`    [${table}] deleted ${count ?? '?'} rows`);
    };
    await trySafeDelete('tenant_query_logs',     'tenant_id', ids);
    await trySafeDelete('tenant_data',           'tenant_id', ids);
    await trySafeDelete('tenant_calendar_tokens','tenant_id', ids);
    // chat_history may or may not have tenant_id column — try both keys
    const { error: chErr1, count: chC1 } = await supabase.from('chat_history').delete({ count: 'exact' }).in('tenant_id', ids);
    if (chErr1) console.log(`    [chat_history by tenant_id] skip: ${chErr1.message}`);
    else        console.log(`    [chat_history by tenant_id] deleted ${chC1 ?? 0} rows`);
  }
  // Also delete chat_history by session_id containing the phone
  const { error: chErr2, count: chC2 } = await supabase
    .from('chat_history').delete({ count: 'exact' }).ilike('session_id', `%${PHONE}%`);
  if (chErr2) console.log(`    [chat_history by session_id] ERROR: ${chErr2.message}`);
  else        console.log(`    [chat_history by session_id] deleted ${chC2 ?? 0} rows`);

  // ── 5. Phone-scoped row deletions ──────────────────────────────
  console.log(`\n[5] Deleting phone-scoped rows`);
  for (const tbl of ['user_databases', 'tenant_phones']) {
    const { error, count } = await supabase.from(tbl).delete({ count: 'exact' }).eq('phone', PHONE);
    if (error) console.log(`    [${tbl}] ERROR: ${error.message}`);
    else       console.log(`    [${tbl}] deleted ${count ?? '?'} rows`);
  }

  // ── 6. Tenant rows (CASCADE handles remaining FK refs) ─────────
  console.log(`\n[6] Deleting tenant rows`);
  for (const id of tenantIds) {
    const { error } = await supabase.from('tenants').delete().eq('id', id);
    if (error) console.log(`    [${id}] ERROR: ${error.message}`);
    else       console.log(`    [${id}] deleted`);
  }
  // Also catch any tenant directly owned by phone (rare edge case)
  const { error: tErr, count: tC } = await supabase.from('tenants').delete({ count: 'exact' }).eq('phone', PHONE);
  if (tErr) console.log(`    [tenants by phone] skip: ${tErr.message}`);
  else      console.log(`    [tenants by phone] deleted ${tC ?? 0} rows`);

  // ── 7. Local JSON cleanup ──────────────────────────────────────
  console.log(`\n[7] Stripping phone from local JSON files`);
  stripPhoneFromJson('access_control.json', PHONE);
  stripPhoneFromJson('.db_selections.json', PHONE);
  stripPhoneFromJson('.wp_sessions.json',  PHONE);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`✅ Wipe complete. Backups saved with suffix .bak-${TS}`);
  console.log(`   Run: node scripts/investigate-phone.js ${PHONE}  to verify zero data.`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
