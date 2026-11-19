CREATE INDEX IF NOT EXISTS "idx_claims_user_created" ON "claim" USING btree ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_claims_status" ON "claim" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_policies_user_tenant_created" ON "policies" USING btree ("user_id", "tenant_id", "created_at");