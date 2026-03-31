ALTER TABLE public."push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'push_subscriptions'
      AND policyname = 'tenant_isolation_push_subscriptions'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_push_subscriptions" ON public."push_subscriptions" USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
      current_tenant_setting,
      current_tenant_setting
    );
  END IF;
END
$$;
