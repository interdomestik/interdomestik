ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "slug" text NOT NULL DEFAULT '';
ALTER TABLE "branches" ALTER COLUMN "slug" DROP DEFAULT;

-- Rename agentId to agent_id if it exists (handling the schema change I just made)
-- Note: If "agentId" column exists, we rename. If it doesn't, we add "agent_id".
-- Since previous schema had "agentId", valid migration is RENAME.
DO $$
BEGIN
  IF EXISTS(SELECT * FROM information_schema.columns WHERE table_name = 'claim' AND column_name = 'agentId') THEN
    ALTER TABLE "claim" RENAME COLUMN "agentId" TO "agent_id";
  ELSE
    ALTER TABLE "claim" ADD COLUMN IF NOT EXISTS "agent_id" text;
  END IF;
END $$;


CREATE UNIQUE INDEX IF NOT EXISTS "branches_tenant_slug_uq" ON "branches" USING btree ("tenant_id","slug");
CREATE INDEX IF NOT EXISTS "idx_branches_tenant" ON "branches" USING btree ("tenant_id");

CREATE INDEX IF NOT EXISTS "idx_memberships_branch" ON "subscriptions" USING btree ("branch_id");
CREATE INDEX IF NOT EXISTS "idx_memberships_agent" ON "subscriptions" USING btree ("agent_id");

CREATE INDEX IF NOT EXISTS "idx_claims_branch" ON "claim" USING btree ("branch_id");
CREATE INDEX IF NOT EXISTS "idx_claims_agent" ON "claim" USING btree ("agent_id");
