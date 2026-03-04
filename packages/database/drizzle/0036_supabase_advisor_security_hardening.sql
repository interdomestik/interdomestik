-- Harden objects flagged by Supabase Security Advisor.
-- 1) Ensure RLS is enabled for exposed public tables with sensitive data.
-- 2) Add explicit deny-all policies for client roles on internal tables.
-- 3) Pin trigger-function search_path to avoid mutable search_path warnings.

ALTER TABLE public."account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."member_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seed_meta" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

DO $$
DECLARE
  target_roles text;
BEGIN
  SELECT COALESCE(string_agg(quote_ident(rolname), ', '), 'public')
    INTO target_roles
  FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated');

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'account'
      AND policyname = 'No public access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "No public access" ON public."account" FOR ALL TO %s USING (false) WITH CHECK (false)',
      target_roles
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session'
      AND policyname = 'No public access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "No public access" ON public."session" FOR ALL TO %s USING (false) WITH CHECK (false)',
      target_roles
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'verification'
      AND policyname = 'No public access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "No public access" ON public."verification" FOR ALL TO %s USING (false) WITH CHECK (false)',
      target_roles
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tenants'
      AND policyname = 'No public access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "No public access" ON public."tenants" FOR ALL TO %s USING (false) WITH CHECK (false)',
      target_roles
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_counters'
      AND policyname = 'No public access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "No public access" ON public."member_counters" FOR ALL TO %s USING (false) WITH CHECK (false)',
      target_roles
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'seed_meta'
      AND policyname = 'No public access'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "No public access" ON public."seed_meta" FOR ALL TO %s USING (false) WITH CHECK (false)',
      target_roles
    );
  END IF;
END
$$;
--> statement-breakpoint

ALTER FUNCTION public.billing_invoices_scope_guard_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.billing_ledger_entries_scope_guard_fn() SET search_path = public, pg_temp;
ALTER FUNCTION public.billing_ledger_entries_append_only_fn() SET search_path = public, pg_temp;
