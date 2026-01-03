-- Phase 2: Add branch_id and agent_id columns for RBAC scoping

-- 1. Add branch_id to users (for staff/agents tied to a branch)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "branch_id" text REFERENCES "branches"("id");

-- 2. Add branch_id and agent_id to subscriptions
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "branch_id" text REFERENCES "branches"("id");
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "agent_id" text REFERENCES "user"("id");

-- 3. Add branch_id to claims (copy from membership)
ALTER TABLE "claim" ADD COLUMN IF NOT EXISTS "branch_id" text REFERENCES "branches"("id");

-- 4. Backfill: Copy agent_id from referredByAgentId to new agent_id column
UPDATE "subscriptions" SET "agent_id" = "referred_by_agent_id" WHERE "agent_id" IS NULL AND "referred_by_agent_id" IS NOT NULL;

-- 5. Backfill: Copy branch_id/agent_id from subscription to claims
UPDATE "claim" c SET 
  "branch_id" = s."branch_id",
  "agentId" = s."agent_id"
FROM "subscriptions" s
WHERE c."userId" = s."user_id" 
  AND c."branch_id" IS NULL 
  AND s."branch_id" IS NOT NULL;

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_user_branch_id" ON "user" ("branch_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_branch_id" ON "subscriptions" ("branch_id");
CREATE INDEX IF NOT EXISTS "idx_subscriptions_agent_id" ON "subscriptions" ("agent_id");
CREATE INDEX IF NOT EXISTS "idx_claim_branch_id" ON "claim" ("branch_id");
CREATE INDEX IF NOT EXISTS "idx_claim_agent_id" ON "claim" ("agentId");
