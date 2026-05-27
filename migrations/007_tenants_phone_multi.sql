-- ════════════════════════════════════════════════════════════════════════════
-- Migration 007 — Allow multiple tenants per phone
-- ────────────────────────────────────────────────────────────────────────────
-- Drops UNIQUE constraint on tenants.phone so a single user (phone) can own
-- multiple separate databases. The architecture already supports this via the
-- user_databases mapping table; only this constraint was blocking it.
--
-- After this migration, a phone is no longer the primary key for a tenant —
-- (phone, name) effectively becomes the human identifier, and tenants.id (UUID)
-- is the real primary key. Lookups by phone now return potentially multiple
-- tenants, which the existing handleTenantQuery / getUserDatabases / `switch db`
-- flow already handles correctly.
-- ════════════════════════════════════════════════════════════════════════════

-- Postgres may name the constraint differently depending on creation order.
-- We try both common names + the column-level UNIQUE shortcut.

-- Drop UNIQUE constraint by common names
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_phone_key;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_phone_unique;
ALTER TABLE tenants DROP CONSTRAINT IF EXISTS unique_phone;

-- Drop unique index if it exists
DROP INDEX IF EXISTS tenants_phone_key;
DROP INDEX IF EXISTS tenants_phone_idx;

-- Optional non-unique index for lookup performance
CREATE INDEX IF NOT EXISTS tenants_phone_lookup_idx ON tenants(phone);

-- Sanity: keep NOT NULL on phone (still required, just not unique)
ALTER TABLE tenants ALTER COLUMN phone SET NOT NULL;
