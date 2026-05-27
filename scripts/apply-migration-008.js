// One-off script to apply migration 008 (tenant_notifications)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const stmts = [
  `CREATE TABLE IF NOT EXISTS tenant_notifications (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phone TEXT,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    severity TEXT DEFAULT 'info',
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS tenant_notifications_phone_idx ON tenant_notifications(phone, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS tenant_notifications_tenant_idx ON tenant_notifications(tenant_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS tenant_notifications_unread_idx ON tenant_notifications(phone) WHERE read_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS tenant_notifications_age_idx ON tenant_notifications(created_at)`
];

(async () => {
  for (const s of stmts) {
    const { error } = await sb.rpc('execute_ddl', { sql_command: s });
    if (error) {
      console.error('FAIL:', s.substring(0, 60), '→', error.message);
      process.exit(1);
    }
    console.log('OK:', s.substring(0, 60));
  }
  const { data, error } = await sb.from('tenant_notifications').select('id').limit(1);
  if (error) console.log('Verify err:', error.message);
  else console.log('✓ Table verified — rows:', data.length);
})();
