-- Migration 008 — tenant_notifications table (Phase 22 Sprint 2D)
--
-- Stores system events surfaced to tenants in the bell-icon notifications
-- drawer. Sources:
--   * schema_drift  : sync helper detected sheet column changes
--   * sync_error    : tenant sync failed (consecutive 3+ times)
--   * calendar_book : meeting created/rescheduled/cancelled
--   * calendar_remind : 15-min before meeting (deduped with existing reminders Set)
--   * tenant_signup : new database registered under this phone
--   * info / warning / error : free-form
--
-- Read-state is tracked per-row.

CREATE TABLE IF NOT EXISTS tenant_notifications (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone       TEXT,                                   -- denormalized for fast lookup
  kind        TEXT         NOT NULL,                  -- schema_drift | sync_error | calendar_book | etc
  title       TEXT         NOT NULL,
  message     TEXT,
  metadata    JSONB        DEFAULT '{}'::jsonb,       -- { event_id, table_name, ... } per kind
  severity    TEXT         DEFAULT 'info',            -- info | warning | error
  read_at     TIMESTAMPTZ,                            -- NULL = unread
  created_at  TIMESTAMPTZ  DEFAULT now() NOT NULL
);

-- Fast lookups
CREATE INDEX IF NOT EXISTS tenant_notifications_phone_idx     ON tenant_notifications(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_notifications_tenant_idx    ON tenant_notifications(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_notifications_unread_idx    ON tenant_notifications(phone) WHERE read_at IS NULL;

-- 60-day retention — older notifications get auto-deleted by a daily cron in
-- the Node server. This index helps that cleanup query.
CREATE INDEX IF NOT EXISTS tenant_notifications_age_idx       ON tenant_notifications(created_at);
