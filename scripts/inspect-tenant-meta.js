// scripts/inspect-tenant-meta.js
// Read-only — show tables_metadata + sample data for a tenant by phone.
// Usage: node scripts/inspect-tenant-meta.js 919999408444

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const PHONE = process.argv[2];
if (!PHONE) { console.error('Usage: node scripts/inspect-tenant-meta.js <PHONE>'); process.exit(1); }
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  // Find tenant
  const { data: t } = await supabase.from('tenants')
    .select('id, name, phone, tables_metadata, schema_json, proper_tables_created')
    .eq('phone', PHONE).maybeSingle();
  if (!t) { console.log('No tenant found with phone', PHONE); process.exit(1); }

  console.log(`Tenant: ${t.name}  (id=${t.id})`);
  console.log(`proper_tables_created: ${t.proper_tables_created}`);

  const tables = t.tables_metadata || [];
  console.log(`\nTables (${tables.length}):`);
  for (const tab of tables) {
    console.log(`\n  ── ${tab.source_name || tab.name}  →  ${tab.pg_table || '(no pg_table)'}   (${tab.row_count || 0} rows)`);
    const cols = tab.columns || [];
    cols.forEach(c => {
      const samples = (c.samples || []).slice(0, 2).join(' | ');
      console.log(`     • ${c.pg_name || c.name}  type=${c.pg_type || c.type}  role=${c.role || '-'}   samples: ${samples}`);
    });
  }

  // Sample rows from each pg_table
  console.log('\n--- sample rows (first 2 per table) ---');
  for (const tab of tables) {
    if (!tab.pg_table) continue;
    const { data: rows, error } = await supabase.from(tab.pg_table).select('*').limit(2);
    if (error) { console.log(`  ${tab.pg_table}: error - ${error.message}`); continue; }
    console.log(`\n  ${tab.pg_table}:`);
    (rows || []).forEach(r => console.log('   ', JSON.stringify(r).slice(0, 200)));
  }
})().catch(e => { console.error(e); process.exit(1); });
