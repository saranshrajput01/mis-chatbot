-- Multi-Tenant SaaS Schema
-- Run this in Supabase SQL Editor

-- 1. Tenants table (each customer/business)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,  -- owner's WhatsApp number (with 91 prefix)
  email TEXT,
  sheet_url TEXT,              -- Google Sheet public URL
  sheet_id TEXT,               -- extracted spreadsheet ID
  business_description TEXT,   -- user's plain-text description of their business
  system_prompt TEXT,          -- auto-generated AI prompt
  schema_json JSONB,           -- auto-detected schema {tables: [{name, columns: [{name, type, samples}]}]}
  status TEXT DEFAULT 'active', -- active / paused / cancelled
  plan TEXT DEFAULT 'free',    -- free / pro / business
  queries_this_month INT DEFAULT 0,
  query_limit INT DEFAULT 50,  -- free = 50, pro = unlimited
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tenant phone mappings (multiple WhatsApp numbers can query one tenant's data)
CREATE TABLE IF NOT EXISTS tenant_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  role TEXT DEFAULT 'user',  -- owner / admin / user
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone)
);

-- 3. Tenant data cache (synced from their Google Sheet)
CREATE TABLE IF NOT EXISTS tenant_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  sheet_name TEXT NOT NULL,    -- tab/sheet name
  row_data JSONB NOT NULL,     -- full row as JSON
  row_index INT,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_data_tenant ON tenant_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_data_sheet ON tenant_data(tenant_id, sheet_name);

-- 4. Query logs per tenant
CREATE TABLE IF NOT EXISTS tenant_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  phone TEXT,
  query TEXT,
  sql_generated TEXT,
  response TEXT,
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create RPC to query tenant data with dynamic SQL-like filtering
CREATE OR REPLACE FUNCTION query_tenant_data(p_tenant_id UUID, p_sheet_name TEXT DEFAULT NULL)
RETURNS SETOF tenant_data AS $$
BEGIN
  IF p_sheet_name IS NOT NULL THEN
    RETURN QUERY SELECT * FROM tenant_data WHERE tenant_id = p_tenant_id AND sheet_name = p_sheet_name;
  ELSE
    RETURN QUERY SELECT * FROM tenant_data WHERE tenant_id = p_tenant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT ALL ON tenants TO service_role;
GRANT ALL ON tenant_phones TO service_role;
GRANT ALL ON tenant_data TO service_role;
GRANT ALL ON tenant_query_logs TO service_role;
GRANT EXECUTE ON FUNCTION query_tenant_data TO service_role;
