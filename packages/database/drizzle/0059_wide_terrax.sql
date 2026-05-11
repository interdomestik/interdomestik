CREATE TABLE "crm_lead_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"changed_by_id" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crm_lead_stage_history_from_stage_check" CHECK ("crm_lead_stage_history"."from_stage" is null or "crm_lead_stage_history"."from_stage" in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
	CONSTRAINT "crm_lead_stage_history_to_stage_check" CHECK ("crm_lead_stage_history"."to_stage" in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'))
);
--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "won_at" timestamp;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "lost_at" timestamp;--> statement-breakpoint
UPDATE "crm_leads"
SET "won_at" = COALESCE("updated_at", "created_at", now()),
    "lost_at" = NULL
WHERE "stage" = 'won';--> statement-breakpoint
UPDATE "crm_leads"
SET "lost_at" = COALESCE("updated_at", "created_at", now()),
    "won_at" = NULL
WHERE "stage" = 'lost';--> statement-breakpoint
UPDATE "crm_leads"
SET "won_at" = NULL,
    "lost_at" = NULL
WHERE "stage" NOT IN ('won', 'lost');--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_lead_stage_history_tenant_lead_occurred_idx" ON "crm_lead_stage_history" USING btree ("tenant_id","lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_lead_stage_history_tenant_to_stage_occurred_idx" ON "crm_lead_stage_history" USING btree ("tenant_id","to_stage","occurred_at");--> statement-breakpoint
ALTER TABLE public."crm_lead_stage_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_lead_stage_history'
      AND policyname = 'tenant_isolation_crm_lead_stage_history'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_crm_lead_stage_history" ON public."crm_lead_stage_history" USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
      current_tenant_setting,
      current_tenant_setting
    );
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_stage_check" CHECK ("crm_leads"."stage" in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'));--> statement-breakpoint
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_terminal_timestamp_check" CHECK (("crm_leads"."stage" = 'won' and "crm_leads"."won_at" is not null and "crm_leads"."lost_at" is null) or ("crm_leads"."stage" = 'lost' and "crm_leads"."lost_at" is not null and "crm_leads"."won_at" is null) or ("crm_leads"."stage" not in ('won', 'lost') and "crm_leads"."won_at" is null and "crm_leads"."lost_at" is null));
