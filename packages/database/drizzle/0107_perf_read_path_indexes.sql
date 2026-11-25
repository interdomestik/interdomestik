-- These read paths scanned the tenant's full history to return one page.
-- Measured on a seeded loopback postgres:16 under a NOBYPASSRLS role. See the PR for evidence.
CREATE INDEX "idx_claim_stage_history_tenant_claim_created" ON "claim_stage_history" USING btree ("tenant_id","claim_id","created_at" DESC,"id" DESC);
--> statement-breakpoint
CREATE INDEX "idx_notifications_tenant_user_created" ON "notifications" USING btree ("tenant_id","user_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX "idx_claims_tenant_updated" ON "claim" USING btree ("tenant_id","updatedAt" DESC,"id" DESC);
