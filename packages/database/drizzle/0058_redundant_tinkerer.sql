ALTER TABLE "crm_leads" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
WITH backfilled AS (
  UPDATE "crm_leads" AS l
  SET "branch_id" = u."branch_id"
  FROM "user" AS u
  WHERE l."branch_id" IS NULL
    AND l."tenant_id" = u."tenant_id"
    AND l."agent_id" = u."id"
    AND u."branch_id" IS NOT NULL
  RETURNING l."id", l."tenant_id", l."agent_id", l."branch_id"
)
INSERT INTO "audit_log" (
  "id",
  "tenant_id",
  "actor_id",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "metadata",
  "created_at"
)
SELECT
  'crm-lead-branch-backfill:' || "id",
  "tenant_id",
  NULL,
  'system',
  'crm_lead_branch_backfilled',
  'crm_lead',
  "id",
  jsonb_build_object(
    'agentId', "agent_id",
    'branchId', "branch_id",
    'source', 'p36-crm-dm01',
    'strategy', 'assigned_agent_current_branch'
  ),
  now()
FROM backfilled
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "audit_log" (
  "id",
  "tenant_id",
  "actor_id",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "metadata",
  "created_at"
)
SELECT
  'crm-lead-branch-backfill-missing:' || l."id",
  l."tenant_id",
  NULL,
  'system',
  'crm_lead_branch_backfill_missing_branch',
  'crm_lead',
  l."id",
  jsonb_build_object(
    'agentId', l."agent_id",
    'source', 'p36-crm-dm01',
    'reason', CASE
      WHEN u."id" IS NULL THEN 'assigned_agent_missing'
      WHEN u."branch_id" IS NULL THEN 'assigned_agent_missing_branch'
      ELSE 'unknown'
    END
  ),
  now()
FROM "crm_leads" AS l
LEFT JOIN "user" AS u
  ON u."tenant_id" = l."tenant_id"
  AND u."id" = l."agent_id"
WHERE l."branch_id" IS NULL
ON CONFLICT ("id") DO NOTHING;
