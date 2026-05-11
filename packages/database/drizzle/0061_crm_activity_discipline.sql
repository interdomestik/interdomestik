ALTER TABLE "crm_activities" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "branch_id" text;--> statement-breakpoint
UPDATE "crm_activities" AS activity
SET "branch_id" = COALESCE(
  (
    SELECT ownership."branch_id"
    FROM "crm_lead_ownership_history" AS ownership
    WHERE ownership."tenant_id" = activity."tenant_id"
      AND ownership."lead_id" = activity."lead_id"
      AND ownership."effective_from" <= COALESCE(activity."occurred_at", activity."created_at", now())
      AND (
        ownership."effective_to" IS NULL
        OR ownership."effective_to" > COALESCE(activity."occurred_at", activity."created_at", now())
      )
    ORDER BY ownership."effective_from" DESC
    LIMIT 1
  ),
  lead."branch_id"
)
FROM "crm_leads" AS lead
WHERE activity."tenant_id" = lead."tenant_id"
  AND activity."lead_id" = lead."id"
  AND activity."branch_id" IS NULL;--> statement-breakpoint
UPDATE "crm_activities"
SET "type" = $crm_activity_type$other$crm_activity_type$
WHERE "type" NOT IN ('call', 'email', 'meeting', 'note', 'other', 'follow_up');--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_leads_tenant_id_id_uq" ON "crm_leads" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_lead_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."crm_leads"("tenant_id","id") ON DELETE no action ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE INDEX "crm_activities_tenant_agent_type_completed_scheduled_idx" ON "crm_activities" USING btree ("tenant_id","agent_id","type","completed_at","scheduled_at");--> statement-breakpoint
CREATE INDEX "crm_activities_tenant_lead_occurred_idx" ON "crm_activities" USING btree ("tenant_id","lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_activities_tenant_branch_occurred_idx" ON "crm_activities" USING btree ("tenant_id","branch_id","occurred_at");--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_type_check" CHECK ("crm_activities"."type" in ('call', 'email', 'meeting', 'note', 'other', 'follow_up'));
