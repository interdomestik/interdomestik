ALTER TABLE public."member_referral_rewards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."member_referral_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_referral_rewards'
      AND policyname = 'tenant_isolation_member_referral_rewards'
  ) THEN
    CREATE POLICY "tenant_isolation_member_referral_rewards" ON public."member_referral_rewards"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_referral_settings'
      AND policyname = 'tenant_isolation_member_referral_settings'
  ) THEN
    CREATE POLICY "tenant_isolation_member_referral_settings" ON public."member_referral_settings"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END
$$;
