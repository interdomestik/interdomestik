CREATE TABLE "crm_lead_ownership_history" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"effective_from" timestamp NOT NULL,
	"effective_to" timestamp,
	"reason" text NOT NULL,
	"changed_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_lead_ownership_history" ADD CONSTRAINT "crm_lead_ownership_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_ownership_history" ADD CONSTRAINT "crm_lead_ownership_history_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_ownership_history" ADD CONSTRAINT "crm_lead_ownership_history_agent_id_user_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_ownership_history" ADD CONSTRAINT "crm_lead_ownership_history_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_ownership_history" ADD CONSTRAINT "crm_lead_ownership_history_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_lead_ownership_history_tenant_lead_effective_idx" ON "crm_lead_ownership_history" USING btree ("tenant_id","lead_id","effective_from");--> statement-breakpoint
CREATE INDEX "crm_lead_ownership_history_tenant_agent_effective_idx" ON "crm_lead_ownership_history" USING btree ("tenant_id","agent_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_lead_ownership_history_one_open_idx" ON "crm_lead_ownership_history" USING btree ("tenant_id","lead_id") WHERE "crm_lead_ownership_history"."effective_to" is null;--> statement-breakpoint
INSERT INTO "crm_lead_ownership_history" (
  "id",
  "tenant_id",
  "lead_id",
  "agent_id",
  "branch_id",
  "effective_from",
  "effective_to",
  "reason",
  "changed_by_id",
  "created_at"
)
SELECT
  'crm_ownership_backfill_' || "id",
  "tenant_id",
  "id",
  "agent_id",
  "branch_id",
  COALESCE("created_at", now()),
  NULL,
  'dm03_backfill',
  NULL,
  now()
FROM "crm_leads"
WHERE "branch_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE public."crm_lead_ownership_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_lead_ownership_history'
      AND policyname = 'tenant_isolation_crm_lead_ownership_history'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_crm_lead_ownership_history" ON public."crm_lead_ownership_history" USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
      current_tenant_setting,
      current_tenant_setting
    );
  END IF;
END
$$;
