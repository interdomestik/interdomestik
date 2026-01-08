-- Enable RLS on sensitive tables
-- Phase 1: Claims & Evidence
ALTER TABLE "claim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "claim_stage_history" ENABLE ROW LEVEL SECURITY;

-- Phase 2: CRM & Membership
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "crm_deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_commissions" ENABLE ROW LEVEL SECURITY;

-- Phase 3: Global Data requiring scoping
ALTER TABLE "member_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- POLICIES
-- NOTE: We rely on 'app.current_tenant_id' being set by withTenant/withTenantContext
-- The cast to ::text is important for type matching.

-- 1. Claims
CREATE POLICY "tenant_isolation_claim" ON "claim"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_claim_documents" ON "claim_documents"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_claim_messages" ON "claim_messages"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_claim_stage_history" ON "claim_stage_history"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- 2. Subscriptions
CREATE POLICY "tenant_isolation_subscriptions" ON "subscriptions"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- 3. CRM
CREATE POLICY "tenant_isolation_crm_leads" ON "crm_leads"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_crm_activities" ON "crm_activities"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_crm_deals" ON "crm_deals"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- 4. Agents
CREATE POLICY "tenant_isolation_agent_clients" ON "agent_clients"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_agent_commissions" ON "agent_commissions"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

-- 5. Notes & Audit
CREATE POLICY "tenant_isolation_member_notes" ON "member_notes"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_audit_log" ON "audit_log"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);

CREATE POLICY "tenant_isolation_notifications" ON "notifications"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::text);
