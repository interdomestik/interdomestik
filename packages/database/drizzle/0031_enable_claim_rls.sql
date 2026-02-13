ALTER TABLE public."claim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."claim_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."claim_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."claim_stage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."agent_commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."member_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim'
      AND policyname = 'tenant_isolation_claim'
  ) THEN
    CREATE POLICY "tenant_isolation_claim" ON public."claim"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_documents'
      AND policyname = 'tenant_isolation_claim_documents'
  ) THEN
    CREATE POLICY "tenant_isolation_claim_documents" ON public."claim_documents"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_messages'
      AND policyname = 'tenant_isolation_claim_messages'
  ) THEN
    CREATE POLICY "tenant_isolation_claim_messages" ON public."claim_messages"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_stage_history'
      AND policyname = 'tenant_isolation_claim_stage_history'
  ) THEN
    CREATE POLICY "tenant_isolation_claim_stage_history" ON public."claim_stage_history"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
      AND policyname = 'tenant_isolation_subscriptions'
  ) THEN
    CREATE POLICY "tenant_isolation_subscriptions" ON public."subscriptions"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_leads'
      AND policyname = 'tenant_isolation_crm_leads'
  ) THEN
    CREATE POLICY "tenant_isolation_crm_leads" ON public."crm_leads"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_activities'
      AND policyname = 'tenant_isolation_crm_activities'
  ) THEN
    CREATE POLICY "tenant_isolation_crm_activities" ON public."crm_activities"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_deals'
      AND policyname = 'tenant_isolation_crm_deals'
  ) THEN
    CREATE POLICY "tenant_isolation_crm_deals" ON public."crm_deals"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_clients'
      AND policyname = 'tenant_isolation_agent_clients'
  ) THEN
    CREATE POLICY "tenant_isolation_agent_clients" ON public."agent_clients"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'agent_commissions'
      AND policyname = 'tenant_isolation_agent_commissions'
  ) THEN
    CREATE POLICY "tenant_isolation_agent_commissions" ON public."agent_commissions"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'member_notes'
      AND policyname = 'tenant_isolation_member_notes'
  ) THEN
    CREATE POLICY "tenant_isolation_member_notes" ON public."member_notes"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'tenant_isolation_audit_log'
  ) THEN
    CREATE POLICY "tenant_isolation_audit_log" ON public."audit_log"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'tenant_isolation_notifications'
  ) THEN
    CREATE POLICY "tenant_isolation_notifications" ON public."notifications"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END
$$;
