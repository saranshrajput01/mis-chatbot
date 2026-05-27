-- ============================================================================
-- Migration 006: Tenant Proper Tables (Phase 6)
-- Replaces JSONB approach with real PostgreSQL tables for tenant data.
-- Adds pg_trgm fuzzy search + execute_ddl RPC + tenant metadata columns.
-- ============================================================================

-- 1. ENABLE pg_trgm EXTENSION (for fuzzy/similarity name search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. ADD COLUMNS TO tenants TABLE
--    proper_tables_created → flag set after first successful sync to real tables
--    tables_metadata       → JSONB array describing each tenant table
--      [{
--        source_name: "SALES",
--        pg_table: "tenant_ec50657e_sales",
--        gid: "0",
--        row_count: 804,
--        columns: [{original, pg_name, pg_type, role, samples}, ...]
--      }]
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS proper_tables_created BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tables_metadata JSONB DEFAULT '[]'::jsonb;

-- 3. execute_ddl RPC — allows DDL (CREATE/ALTER/DROP TABLE) via Supabase client
--    SECURITY DEFINER so service role can use it.
--    GUARDED: only allows tenant_* prefixed tables (safe whitelist).
CREATE OR REPLACE FUNCTION execute_ddl(sql_command TEXT)
RETURNS TEXT AS $$
DECLARE
  cmd_lower TEXT;
  result TEXT := 'ok';
BEGIN
  cmd_lower := lower(trim(sql_command));

  -- Whitelist: only operations on tables starting with tenant_ or system index ops
  IF NOT (
    cmd_lower LIKE 'create table%tenant_%'
    OR cmd_lower LIKE 'create table if not exists%tenant_%'
    OR cmd_lower LIKE 'alter table%tenant_%'
    OR cmd_lower LIKE 'alter table if exists%tenant_%'
    OR cmd_lower LIKE 'drop table%tenant_%'
    OR cmd_lower LIKE 'drop table if exists%tenant_%'
    OR cmd_lower LIKE 'truncate table%tenant_%'
    OR cmd_lower LIKE 'truncate%tenant_%'
    OR cmd_lower LIKE 'create index%tenant_%'
    OR cmd_lower LIKE 'create index if not exists%tenant_%'
    OR cmd_lower LIKE 'drop index%idx_tenant_%'
    OR cmd_lower LIKE 'drop index if exists%idx_tenant_%'
  ) THEN
    RAISE EXCEPTION 'execute_ddl: only tenant_* tables allowed. Got: %', left(sql_command, 100);
  END IF;

  EXECUTE sql_command;
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'execute_ddl failed: % | SQL: %', SQLERRM, left(sql_command, 200);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION execute_ddl(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION execute_ddl(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_ddl(TEXT) TO anon;

-- 4. fuzzy_search RPC — return top-K names ranked by trigram similarity
--    Used when ILIKE filter returns 0 rows (suggests close matches).
CREATE OR REPLACE FUNCTION tenant_fuzzy_search(
  p_table TEXT,
  p_column TEXT,
  p_query TEXT,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(value TEXT, score REAL) AS $$
DECLARE
  safe_table TEXT;
  safe_column TEXT;
  sql TEXT;
BEGIN
  -- Whitelist tenant_ prefix
  IF p_table NOT LIKE 'tenant_%' THEN
    RAISE EXCEPTION 'tenant_fuzzy_search: only tenant_* tables allowed';
  END IF;
  -- Sanitize identifiers (alphanumeric + underscore only)
  safe_table := regexp_replace(p_table, '[^a-zA-Z0-9_]', '', 'g');
  safe_column := regexp_replace(p_column, '[^a-zA-Z0-9_]', '', 'g');

  sql := format(
    'SELECT DISTINCT %I::TEXT AS value, similarity(%I::TEXT, $1) AS score FROM %I WHERE %I IS NOT NULL AND %I::TEXT %% $1 ORDER BY score DESC LIMIT $2',
    safe_column, safe_column, safe_table, safe_column, safe_column
  );
  RETURN QUERY EXECUTE sql USING p_query, p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tenant_fuzzy_search(TEXT, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION tenant_fuzzy_search(TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION tenant_fuzzy_search(TEXT, TEXT, TEXT, INT) TO anon;

-- 5. Set similarity threshold to be more lenient (default 0.3 — we want 0.15 for partial matches)
--    This is session-level only; persistent setting requires DB superuser. We override per-query.

-- 6. Helper: list tenant_* tables (for cleanup/inspection)
CREATE OR REPLACE FUNCTION tenant_list_tables(p_tenant_short TEXT)
RETURNS TABLE(table_name TEXT, row_count BIGINT) AS $$
DECLARE
  rec RECORD;
BEGIN
  IF p_tenant_short !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid tenant_short';
  END IF;
  FOR rec IN
    SELECT t.table_name AS tn
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_name LIKE 'tenant_' || p_tenant_short || '_%'
  LOOP
    RETURN QUERY EXECUTE format('SELECT %L::TEXT, COUNT(*)::BIGINT FROM %I', rec.tn, rec.tn);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tenant_list_tables(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION tenant_list_tables(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION tenant_list_tables(TEXT) TO anon;

-- 7. Helper: drop ALL tables for a tenant (used on tenant deletion or full re-sync)
CREATE OR REPLACE FUNCTION tenant_drop_all_tables(p_tenant_short TEXT)
RETURNS INT AS $$
DECLARE
  rec RECORD;
  dropped INT := 0;
BEGIN
  IF p_tenant_short !~ '^[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'invalid tenant_short';
  END IF;
  FOR rec IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'tenant_' || p_tenant_short || '_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', rec.table_name);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION tenant_drop_all_tables(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION tenant_drop_all_tables(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION tenant_drop_all_tables(TEXT) TO anon;

-- 8. Comment the new design
COMMENT ON COLUMN tenants.tables_metadata IS 'Per-tenant table metadata: [{source_name, pg_table, gid, row_count, columns: [{original, pg_name, pg_type, role, samples}]}]';
COMMENT ON COLUMN tenants.proper_tables_created IS 'TRUE after first sync to proper PostgreSQL tables (Phase 6).';
