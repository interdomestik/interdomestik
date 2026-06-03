ALTER TABLE public."domain_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'domain_events'
      AND policyname = 'tenant_isolation_domain_events'
  ) THEN
    CREATE POLICY "tenant_isolation_domain_events" ON public."domain_events"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END $$;
