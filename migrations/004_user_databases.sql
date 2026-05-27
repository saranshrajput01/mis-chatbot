-- Phase 3: Multi-DB Routing
-- Run this in Supabase SQL Editor

-- user_databases: maps one phone to multiple tenant DBs (no unique constraint on phone)
CREATE TABLE IF NOT EXISTS user_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  alias TEXT,              -- user-friendly name like "Sharma Store" or "Office Data"
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone, tenant_id)  -- same phone can't be linked to same tenant twice
);

CREATE INDEX IF NOT EXISTS idx_user_databases_phone ON user_databases(phone);

-- Migrate existing tenant_phones data into user_databases
INSERT INTO user_databases (phone, tenant_id, alias, is_default)
SELECT tp.phone, tp.tenant_id, t.name, true
FROM tenant_phones tp
JOIN tenants t ON t.id = tp.tenant_id
ON CONFLICT (phone, tenant_id) DO NOTHING;

-- Also add tenant owners
INSERT INTO user_databases (phone, tenant_id, alias, is_default)
SELECT t.phone, t.id, t.name, true
FROM tenants t
WHERE t.phone IS NOT NULL
ON CONFLICT (phone, tenant_id) DO NOTHING;

-- Grant permissions
GRANT ALL ON user_databases TO service_role;
