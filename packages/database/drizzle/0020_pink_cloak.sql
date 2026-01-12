ALTER TABLE "claim" ALTER COLUMN "origin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "claim" ADD COLUMN "origin_ref_id" text;

-- Backfill: Agent
UPDATE "claim" SET "origin" = 'agent', "origin_ref_id" = "agent_id" WHERE "agent_id" IS NOT NULL;

-- Backfill: Admin (best effort)
UPDATE "claim" AS c
SET "origin" = 'admin', "origin_ref_id" = c."userId"
FROM "user" AS u
WHERE c."userId" = u.id 
  AND u.role = 'admin' 
  AND c."agent_id" IS NULL 
  AND c."origin" = 'portal';