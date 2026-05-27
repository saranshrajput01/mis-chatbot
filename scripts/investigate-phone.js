// scripts/investigate-phone.js
// READ-ONLY investigation of all data tied to a phone number.
// Usage: node scripts/investigate-phone.js 919990930044

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const PHONE = process.argv[2];
if (!PHONE || !/^\d{10,15}$/.test(PHONE)) {
  console.error('Usage: node scripts/investigate-phone.js <PHONE_DIGITS_ONLY>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  console.log(`\n🔍 Investigating data for phone: ${PHONE}\n${'─'.repeat(60)}`);

  // 1. tenants table — owner phone
  const { data: tenantsByPhone } = await supabase
    .from('tenants')
    .select('id, name, phone, email, sheet_url, created_at')
    .eq('phone', PHONE);
  console.log(`\n[1] tenants (phone = ${PHONE}):`);
  if (tenantsByPhone?.length) tenantsByPhone.forEach(t => console.log(`    • ${t.name}   id=${t.id}   created=${t.created_at}`));
  else console.log('    (none)');

  // 2. tenant_phones — mapped phone
  const { data: tenantPhones } = await supabase
    .from('tenant_phones')
    .select('tenant_id, phone, role')
    .eq('phone', PHONE);
  console.log(`\n[2] tenant_phones (phone = ${PHONE}):`);
  if (tenantPhones?.length) tenantPhones.forEach(p => console.log(`    • tenant_id=${p.tenant_id}   role=${p.role}`));
  else console.log('    (none)');

  // 3. user_databases — DB picks
  const { data: userDbs } = await supabase
    .from('user_databases')
    .select('tenant_id, alias, is_default')
    .eq('phone', PHONE);
  console.log(`\n[3] user_databases (phone = ${PHONE}):`);
  if (userDbs?.length) userDbs.forEach(u => console.log(`    • tenant_id=${u.tenant_id}   alias=${u.alias}   default=${u.is_default}`));
  else console.log('    (none)');

  // Collect all tenant IDs to inspect
  const tenantIds = new Set();
  (tenantsByPhone || []).forEach(t => tenantIds.add(t.id));
  (tenantPhones || []).forEach(p => p.tenant_id && tenantIds.add(p.tenant_id));
  (userDbs || []).forEach(u => u.tenant_id && tenantIds.add(u.tenant_id));

  console.log(`\n[4] All linked tenant_ids: ${tenantIds.size === 0 ? '(none)' : ''}`);
  for (const id of tenantIds) console.log(`    • ${id}`);

  // 5. tenant_query_logs
  if (tenantIds.size) {
    const { data: logs, count } = await supabase
      .from('tenant_query_logs')
      .select('id', { count: 'exact', head: true })
      .in('tenant_id', Array.from(tenantIds));
    console.log(`\n[5] tenant_query_logs rows for these tenants: ${count ?? '?'}`);
  } else {
    console.log(`\n[5] tenant_query_logs: skipped (no tenant ids)`);
  }

  // 6. tenant_data (legacy JSONB)
  if (tenantIds.size) {
    const { count } = await supabase
      .from('tenant_data')
      .select('id', { count: 'exact', head: true })
      .in('tenant_id', Array.from(tenantIds));
    console.log(`\n[6] tenant_data legacy rows for these tenants: ${count ?? '?'}`);
  } else {
    console.log(`\n[6] tenant_data: skipped`);
  }

  // 7. tenant_<short>_* dynamic tables — list via RPC
  console.log(`\n[7] Dynamic per-tenant tables (tenant_<short>_<sheet>):`);
  for (const id of tenantIds) {
    const short = id.replace(/-/g, '').slice(0, 8);
    const { data: tables, error } = await supabase.rpc('tenant_list_tables', { p_tenant_short: short });
    if (error) {
      console.log(`    [${short}] error: ${error.message}`);
      continue;
    }
    if (!tables?.length) {
      console.log(`    [${short}] (no tables)`);
    } else {
      tables.forEach(t => console.log(`    [${short}] ${t.table_name}   (${t.row_count} rows)`));
    }
  }

  // 8. chat_history — by phone (web sessions are stored by phone OR by session id)
  const { data: chatRows, count: chatCount } = await supabase
    .from('chat_history')
    .select('session_id', { count: 'exact', head: true })
    .ilike('session_id', `%${PHONE}%`);
  console.log(`\n[8] chat_history sessions containing phone ${PHONE}: ${chatCount ?? 0}`);

  // Also check for messages where tenant matches
  if (tenantIds.size) {
    const { count: tenantChatCount } = await supabase
      .from('chat_history')
      .select('id', { count: 'exact', head: true })
      .in('tenant_id', Array.from(tenantIds));
    console.log(`    chat_history rows tagged to these tenant_ids: ${tenantChatCount ?? 0}`);
  }

  // 9. tenant_calendar_tokens
  if (tenantIds.size) {
    const { data: calTokens } = await supabase
      .from('tenant_calendar_tokens')
      .select('tenant_id')
      .in('tenant_id', Array.from(tenantIds));
    console.log(`\n[9] tenant_calendar_tokens for these tenants: ${calTokens?.length ?? 0}`);
  } else {
    console.log(`\n[9] tenant_calendar_tokens: skipped`);
  }

  // 10. Local files
  console.log(`\n[10] Local JSON files:`);
  const root = path.join(__dirname, '..');
  for (const f of ['access_control.json', '.db_selections.json', '.wp_sessions.json']) {
    const fp = path.join(root, f);
    if (!fs.existsSync(fp)) { console.log(`    ${f}: (not present)`); continue; }
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const hasPhone = content.includes(PHONE);
      console.log(`    ${f}: ${hasPhone ? '✓ contains phone' : '— phone not present'}`);
      if (hasPhone) {
        // Try to print specific entries
        const j = JSON.parse(content);
        if (j[PHONE]) console.log(`         entry [${PHONE}]:`, JSON.stringify(j[PHONE]).slice(0, 200));
      }
    } catch (e) {
      console.log(`    ${f}: error reading — ${e.message}`);
    }
  }

  console.log(`\n${'─'.repeat(60)}\n✓ Read-only investigation complete. No data modified.\n`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
