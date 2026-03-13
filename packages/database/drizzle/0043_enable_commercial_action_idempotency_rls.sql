ALTER TABLE public."commercial_action_idempotency" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'commercial_action_idempotency'
      AND policyname = 'tenant_isolation_commercial_action_idempotency'
  ) THEN
    CREATE POLICY "tenant_isolation_commercial_action_idempotency" ON public."commercial_action_idempotency"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END
$$;
