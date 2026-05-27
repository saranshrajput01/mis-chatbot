-- Phase 5: Calendar per Tenant
-- Run this in Supabase SQL Editor

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_refresh_token TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN DEFAULT false;
