CREATE TABLE "crm_pipeline_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text,
	"pipeline_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"snapshot_version" integer NOT NULL,
	"currency_code" text NOT NULL,
	"open_deal_count" integer NOT NULL,
	"raw_value_amount_minor" integer NOT NULL,
	"weighted_value_amount_minor" integer NOT NULL,
	"forecast_pipeline_amount_minor" integer NOT NULL,
	"forecast_best_amount_minor" integer NOT NULL,
	"forecast_commit_amount_minor" integer NOT NULL,
	"forecast_omitted_amount_minor" integer NOT NULL,
	"closed_won_amount_minor" integer NOT NULL,
	"closed_lost_amount_minor" integer NOT NULL,
	"source_run_id" text,
	"idempotency_key" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text,
	CONSTRAINT "crm_pipeline_snapshots_version_check" CHECK ("crm_pipeline_snapshots"."snapshot_version" >= 1),
	CONSTRAINT "crm_pipeline_snapshots_currency_code_check" CHECK ("crm_pipeline_snapshots"."currency_code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "crm_pipeline_snapshots_open_count_check" CHECK ("crm_pipeline_snapshots"."open_deal_count" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_raw_value_check" CHECK ("crm_pipeline_snapshots"."raw_value_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_weighted_value_check" CHECK ("crm_pipeline_snapshots"."weighted_value_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_forecast_pipeline_check" CHECK ("crm_pipeline_snapshots"."forecast_pipeline_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_forecast_best_check" CHECK ("crm_pipeline_snapshots"."forecast_best_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_forecast_commit_check" CHECK ("crm_pipeline_snapshots"."forecast_commit_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_forecast_omitted_check" CHECK ("crm_pipeline_snapshots"."forecast_omitted_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_closed_won_check" CHECK ("crm_pipeline_snapshots"."closed_won_amount_minor" >= 0),
	CONSTRAINT "crm_pipeline_snapshots_closed_lost_check" CHECK ("crm_pipeline_snapshots"."closed_lost_amount_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "crm_pipeline_snapshots" ADD CONSTRAINT "crm_pipeline_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_snapshots" ADD CONSTRAINT "crm_pipeline_snapshots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_snapshots" ADD CONSTRAINT "crm_pipeline_snapshots_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_snapshots" ADD CONSTRAINT "crm_pipeline_snapshots_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_snapshots" ADD CONSTRAINT "crm_pipeline_snapshots_tenant_pipeline_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."crm_pipelines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_snapshots_version_uq" ON "crm_pipeline_snapshots" USING btree ("tenant_id","pipeline_id",coalesce("branch_id", ''),"currency_code","snapshot_date","snapshot_version");--> statement-breakpoint
CREATE INDEX "crm_pipeline_snapshots_tenant_date_idx" ON "crm_pipeline_snapshots" USING btree ("tenant_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "crm_pipeline_snapshots_tenant_pipeline_date_idx" ON "crm_pipeline_snapshots" USING btree ("tenant_id","pipeline_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "crm_pipeline_snapshots_tenant_branch_date_idx" ON "crm_pipeline_snapshots" USING btree ("tenant_id","branch_id","snapshot_date");--> statement-breakpoint
ALTER TABLE public."crm_pipeline_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'crm_pipeline_snapshots'
      AND policyname = 'tenant_isolation_crm_pipeline_snapshots'
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
      'tenant_isolation_crm_pipeline_snapshots',
      'crm_pipeline_snapshots',
      current_tenant_setting,
      current_tenant_setting
    );
  END IF;
END
$$;
