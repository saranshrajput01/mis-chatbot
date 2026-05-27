-- Phase G: Read-only role for chatbot queries
-- Run this in Supabase SQL Editor

-- Create a read-only role (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mis_readonly') THEN
    CREATE ROLE mis_readonly NOLOGIN;
  END IF;
END $$;

-- Grant read-only access to all relevant tables
GRANT USAGE ON SCHEMA public TO mis_readonly;
GRANT SELECT ON public.sales, public.expenses, public.pending, public.ledger,
  public.products, public.delegation_tasks, public.checklist_tasks, public.scores
  TO mis_readonly;

-- Grant the role to the authenticated and anon roles (used by Supabase clients)
GRANT mis_readonly TO authenticated;
GRANT mis_readonly TO anon;

-- Ensure future tables also get SELECT for this role
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO mis_readonly;
