CREATE TABLE IF NOT EXISTS "tenants" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "legal_name" text NOT NULL,
  "country_code" text NOT NULL,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "tax_id" text,
  "address" jsonb,
  "contact" jsonb,
  "branding" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tenant_settings" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "category" text NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_settings_tenant_category_key_uq"
  ON "tenant_settings" ("tenant_id", "category", "key");

INSERT INTO "tenants" ("id", "name", "legal_name", "country_code", "currency", "is_active")
VALUES
  ('tenant_mk', 'Interdomestik MK', 'Interdomestik DOOEL Skopje', 'MK', 'MKD', true),
  ('tenant_ks', 'Interdomestik KS', 'Interdomestik Sh.p.k Prishtine', 'XK', 'EUR', true)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "membership_plans"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "membership_family_members"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "user_notification_preferences"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE IF EXISTS "push_subscriptions"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "claim"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "claim_documents"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "claim_messages"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "claim_stage_history"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "crm_leads"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "crm_activities"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "crm_deals"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "member_activities"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "agent_clients"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "agent_commissions"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "agent_settings"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "referrals"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "service_usage"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "service_requests"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "partner_discount_usage"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "lead_downloads"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "email_campaign_logs"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "member_notes"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "audit_log"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "automation_logs"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "engagement_email_sends"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "nps_survey_tokens"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "nps_survey_responses"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "policies"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");
ALTER TABLE "webhook_events"
  ADD COLUMN IF NOT EXISTS "tenant_id" text NOT NULL DEFAULT 'tenant_mk' REFERENCES "tenants"("id");

CREATE INDEX IF NOT EXISTS "idx_user_tenant_id" ON "user" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_membership_plans_tenant_id" ON "membership_plans" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_tenant_id" ON "subscriptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_claim_tenant_id" ON "claim" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_claim_documents_tenant_id" ON "claim_documents" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_claim_messages_tenant_id" ON "claim_messages" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_claim_stage_history_tenant_id" ON "claim_stage_history" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_crm_leads_tenant_id" ON "crm_leads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_crm_activities_tenant_id" ON "crm_activities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_crm_deals_tenant_id" ON "crm_deals" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_member_activities_tenant_id" ON "member_activities" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_agent_clients_tenant_id" ON "agent_clients" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_agent_commissions_tenant_id" ON "agent_commissions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_agent_settings_tenant_id" ON "agent_settings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_referrals_tenant_id" ON "referrals" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_service_usage_tenant_id" ON "service_usage" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_service_requests_tenant_id" ON "service_requests" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_partner_discount_usage_tenant_id" ON "partner_discount_usage" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_lead_downloads_tenant_id" ON "lead_downloads" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_notifications_tenant_id" ON "notifications" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_email_campaign_logs_tenant_id" ON "email_campaign_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_member_notes_tenant_id" ON "member_notes" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_audit_log_tenant_id" ON "audit_log" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_automation_logs_tenant_id" ON "automation_logs" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_engagement_email_sends_tenant_id" ON "engagement_email_sends" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_nps_survey_tokens_tenant_id" ON "nps_survey_tokens" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_nps_survey_responses_tenant_id" ON "nps_survey_responses" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_policies_tenant_id" ON "policies" ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_webhook_events_tenant_id" ON "webhook_events" ("tenant_id");
