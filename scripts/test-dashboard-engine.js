// scripts/test-dashboard-engine.js
// Standalone test for helpers/dashboard-engine.js against a real tenant.
// Usage: node scripts/test-dashboard-engine.js <tenant_id>  [range]

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { buildDashboard } = require('../helpers/dashboard-engine');

const TENANT_ID = process.argv[2];
const RANGE     = process.argv[3] || 'month';
if (!TENANT_ID) { console.error('Usage: node scripts/test-dashboard-engine.js <tenant_id> [range]'); process.exit(1); }

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
  const t0 = Date.now();
  const out = await buildDashboard(supabase, TENANT_ID, { range: RANGE });
  const ms = Date.now() - t0;
  console.log(`\nDashboard built in ${ms}ms\n`);
  console.log('Tenant:', out.tenant);
  console.log('Range:', out.range, out.date_range);
  console.log('Detected roles:', out.detected_roles);
  console.log(`\nWidgets (${(out.widgets || []).length}):`);
  for (const w of (out.widgets || [])) {
    if (!w.ok) { console.log(`  ❌ ${w.kind}.${w.id}  →  ${w.error}`); continue; }
    if (w.kind === 'kpi') {
      const d = w.data || {};
      console.log(`  ✓ ${w.id.padEnd(28)}  value=${Number(d.value).toLocaleString('en-IN')}  prev=${d.prev ?? '-'}  Δ=${d.delta_pct?.toFixed(1) ?? '-'}%  fmt=${d.format}`);
    } else if (w.kind === 'chart') {
      const n = (w.data?.labels || []).length;
      const top = (w.data?.labels || []).slice(0, 3).join(' | ');
      console.log(`  ✓ ${w.id.padEnd(28)}  [${w.chartKind}]  points=${n}  top: ${top}`);
    } else if (w.kind === 'table') {
      const n = (w.data?.rows || []).length;
      console.log(`  ✓ ${w.id.padEnd(28)}  rows=${n}`);
      (w.data?.rows || []).slice(0, 2).forEach(r => console.log(`       ${JSON.stringify(r).slice(0, 140)}`));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
