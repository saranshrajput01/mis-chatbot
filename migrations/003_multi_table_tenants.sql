-- Phase 2.5: Multi-table support for tenants
-- Run this in Supabase SQL Editor

-- Add table_name column (stores actual tab name like "SALES", "EXPENSES")
-- We keep sheet_name for backward compat but add table_name as the proper identifier
ALTER TABLE tenant_data ADD COLUMN IF NOT EXISTS table_name TEXT;

-- Migrate existing data: extract meaningful name from sheet_name
UPDATE tenant_data SET table_name = sheet_name WHERE table_name IS NULL;

-- Index for fast per-table queries
CREATE INDEX IF NOT EXISTS idx_tenant_data_table ON tenant_data(tenant_id, table_name);

-- Update schema_json comment: now stores {tables: [{name, gid, columns: [...]}]}
COMMENT ON COLUMN tenants.schema_json IS 'Multi-table schema: {tables: [{name, gid, row_count, columns: [{name, type, samples}]}]}';
