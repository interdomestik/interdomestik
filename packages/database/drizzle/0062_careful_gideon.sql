CREATE TABLE "crm_deal_backfill_quarantine" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deal_stage_history" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"from_stage_id" text,
	"to_stage_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"loss_reason_id" text,
	"reason" text,
	"idempotency_key" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_deal_stage_history_kind_check" CHECK ("crm_deal_stage_history"."kind" in ('created', 'stage_changed', 'won', 'lost', 'reopened'))
);
--> statement-breakpoint
CREATE TABLE "crm_loss_reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_pipeline_stages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"probability" integer NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"expected_duration_days" integer,
	"archived_at" timestamp with time zone,
	"archived_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crm_pipeline_stages_probability_check" CHECK ("crm_pipeline_stages"."probability" >= 0 and "crm_pipeline_stages"."probability" <= 100),
	CONSTRAINT "crm_pipeline_stages_terminal_check" CHECK (not ("crm_pipeline_stages"."is_won" and "crm_pipeline_stages"."is_lost"))
);
--> statement-breakpoint
CREATE TABLE "crm_pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_deals" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "pipeline_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "current_stage_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "expected_close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "forecast_category" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "currency_code" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "value_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "loss_reason_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "archived_by_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_tenant_id_id_uq" ON "crm_pipelines" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_tenant_id_id_uq" ON "crm_pipeline_stages" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_loss_reasons_tenant_id_id_uq" ON "crm_loss_reasons" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_deals_tenant_id_id_uq" ON "crm_deals" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "crm_deal_backfill_quarantine" ADD CONSTRAINT "crm_deal_backfill_quarantine_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_backfill_quarantine" ADD CONSTRAINT "crm_deal_backfill_quarantine_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_backfill_quarantine" ADD CONSTRAINT "crm_deal_backfill_quarantine_tenant_deal_fk" FOREIGN KEY ("tenant_id","deal_id") REFERENCES "public"."crm_deals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_from_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_to_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_loss_reason_id_crm_loss_reasons_id_fk" FOREIGN KEY ("loss_reason_id") REFERENCES "public"."crm_loss_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_tenant_deal_fk" FOREIGN KEY ("tenant_id","deal_id") REFERENCES "public"."crm_deals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_tenant_pipeline_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."crm_pipelines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_tenant_from_stage_fk" FOREIGN KEY ("tenant_id","from_stage_id") REFERENCES "public"."crm_pipeline_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_tenant_to_stage_fk" FOREIGN KEY ("tenant_id","to_stage_id") REFERENCES "public"."crm_pipeline_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deal_stage_history" ADD CONSTRAINT "crm_deal_stage_history_tenant_loss_reason_fk" FOREIGN KEY ("tenant_id","loss_reason_id") REFERENCES "public"."crm_loss_reasons"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_loss_reasons" ADD CONSTRAINT "crm_loss_reasons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_loss_reasons" ADD CONSTRAINT "crm_loss_reasons_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_loss_reasons" ADD CONSTRAINT "crm_loss_reasons_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD CONSTRAINT "crm_pipeline_stages_tenant_pipeline_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."crm_pipelines"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_pipelines" ADD CONSTRAINT "crm_pipelines_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_deal_backfill_quarantine_tenant_deal_reason_uq" ON "crm_deal_backfill_quarantine" USING btree ("tenant_id","deal_id","reason_code");--> statement-breakpoint
CREATE INDEX "crm_deal_stage_history_tenant_deal_occurred_idx" ON "crm_deal_stage_history" USING btree ("tenant_id","deal_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_deal_stage_history_tenant_to_stage_occurred_idx" ON "crm_deal_stage_history" USING btree ("tenant_id","to_stage_id","occurred_at");--> statement-breakpoint
CREATE INDEX "crm_loss_reasons_tenant_archived_idx" ON "crm_loss_reasons" USING btree ("tenant_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_loss_reasons_tenant_branch_code_active_uq" ON "crm_loss_reasons" USING btree ("tenant_id","branch_id","code") WHERE "crm_loss_reasons"."archived_at" is null and "crm_loss_reasons"."branch_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_loss_reasons_tenant_code_active_uq" ON "crm_loss_reasons" USING btree ("tenant_id","code") WHERE "crm_loss_reasons"."archived_at" is null and "crm_loss_reasons"."branch_id" is null;--> statement-breakpoint
CREATE INDEX "crm_pipeline_stages_tenant_pipeline_order_idx" ON "crm_pipeline_stages" USING btree ("tenant_id","pipeline_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_active_order_uq" ON "crm_pipeline_stages" USING btree ("tenant_id","pipeline_id","order") WHERE "crm_pipeline_stages"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipeline_stages_one_won_active_uq" ON "crm_pipeline_stages" USING btree ("tenant_id","pipeline_id") WHERE "crm_pipeline_stages"."is_won" = true and "crm_pipeline_stages"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "crm_pipelines_tenant_archived_idx" ON "crm_pipelines" USING btree ("tenant_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_tenant_branch_name_active_uq" ON "crm_pipelines" USING btree ("tenant_id","branch_id","name") WHERE "crm_pipelines"."archived_at" is null and "crm_pipelines"."branch_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "crm_pipelines_tenant_name_active_uq" ON "crm_pipelines" USING btree ("tenant_id","name") WHERE "crm_pipelines"."archived_at" is null and "crm_pipelines"."branch_id" is null;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_pipeline_id_crm_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."crm_pipelines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_current_stage_id_crm_pipeline_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."crm_pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_loss_reason_id_crm_loss_reasons_id_fk" FOREIGN KEY ("loss_reason_id") REFERENCES "public"."crm_loss_reasons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_archived_by_id_user_id_fk" FOREIGN KEY ("archived_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenant_pipeline_fk" FOREIGN KEY ("tenant_id","pipeline_id") REFERENCES "public"."crm_pipelines"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenant_current_stage_fk" FOREIGN KEY ("tenant_id","current_stage_id") REFERENCES "public"."crm_pipeline_stages"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenant_loss_reason_fk" FOREIGN KEY ("tenant_id","loss_reason_id") REFERENCES "public"."crm_loss_reasons"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_deals_tenant_pipeline_stage_idx" ON "crm_deals" USING btree ("tenant_id","pipeline_id","current_stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_tenant_branch_stage_idx" ON "crm_deals" USING btree ("tenant_id","branch_id","current_stage_id");--> statement-breakpoint
CREATE INDEX "crm_deals_tenant_archived_idx" ON "crm_deals" USING btree ("tenant_id","archived_at");--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_forecast_category_check" CHECK ("crm_deals"."forecast_category" is null or "crm_deals"."forecast_category" in ('pipeline', 'best', 'commit', 'omitted', 'closed'));--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_currency_code_check" CHECK ("crm_deals"."currency_code" is null or "crm_deals"."currency_code" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_value_amount_minor_check" CHECK ("crm_deals"."value_amount_minor" is null or "crm_deals"."value_amount_minor" >= 0);--> statement-breakpoint
SET statement_timeout = '5s';--> statement-breakpoint
INSERT INTO "crm_pipelines" (
  "id",
  "tenant_id",
  "branch_id",
  "name",
  "created_at",
  "updated_at"
)
SELECT DISTINCT
  'crm04_default_pipeline:' || d."tenant_id" || ':' || l."branch_id",
  d."tenant_id",
  l."branch_id",
  'Default Sales Pipeline',
  now(),
  now()
FROM "crm_deals" d
JOIN "crm_leads" l
  ON l."tenant_id" = d."tenant_id"
  AND l."id" = d."lead_id"
WHERE l."branch_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "crm_pipeline_stages" (
  "id",
  "tenant_id",
  "pipeline_id",
  "name",
  "order",
  "probability",
  "is_won",
  "is_lost",
  "created_at",
  "updated_at"
)
SELECT
  'crm04_stage:' || p."tenant_id" || ':' || p."branch_id" || ':' || stage_def."code",
  p."tenant_id",
  p."id",
  stage_def."name",
  stage_def."order",
  stage_def."probability",
  stage_def."is_won",
  stage_def."is_lost",
  now(),
  now()
FROM "crm_pipelines" p
CROSS JOIN (
  VALUES
    ('proposal', 'Proposal', 10, 40, false, false),
    ('negotiation', 'Negotiation', 20, 70, false, false),
    ('closed_won', 'Closed Won', 30, 100, true, false),
    ('closed_lost', 'Closed Lost', 40, 0, false, true)
) AS stage_def("code", "name", "order", "probability", "is_won", "is_lost")
WHERE p."id" LIKE 'crm04_default_pipeline:%'
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "crm_loss_reasons" (
  "id",
  "tenant_id",
  "code",
  "label",
  "created_at",
  "updated_at"
)
SELECT
  'crm04_loss_reason:' || t."id" || ':' || reason_def."code",
  t."id",
  reason_def."code",
  reason_def."label",
  now(),
  now()
FROM "tenants" t
CROSS JOIN (
  VALUES
    ('price', 'Price'),
    ('competitor', 'Competitor'),
    ('timing', 'Timing'),
    ('no_decision', 'No decision'),
    ('other', 'Other')
) AS reason_def("code", "label")
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "crm_deal_backfill_quarantine" (
  "id",
  "tenant_id",
  "deal_id",
  "reason_code",
  "created_at"
)
SELECT
  'crm04_quarantine:' || d."id" || ':missing_branch',
  d."tenant_id",
  d."id",
  'missing_branch',
  now()
FROM "crm_deals" d
LEFT JOIN "crm_leads" l
  ON l."tenant_id" = d."tenant_id"
  AND l."id" = d."lead_id"
WHERE l."branch_id" IS NULL
ON CONFLICT ("tenant_id", "deal_id", "reason_code") DO NOTHING;--> statement-breakpoint
INSERT INTO "crm_deal_backfill_quarantine" (
  "id",
  "tenant_id",
  "deal_id",
  "reason_code",
  "created_at"
)
SELECT
  'crm04_quarantine:' || d."id" || ':unknown_currency',
  d."tenant_id",
  d."id",
  'unknown_currency',
  now()
FROM "crm_deals" d
LEFT JOIN "tenants" t
  ON t."id" = d."tenant_id"
WHERE t."currency" IS NULL
  OR t."currency" !~ '^[A-Z]{3}$'
ON CONFLICT ("tenant_id", "deal_id", "reason_code") DO NOTHING;--> statement-breakpoint
DO $$
DECLARE
  backfill_batch_size integer := 1000;
  updated_count integer := 0;
BEGIN
  LOOP
    WITH candidate AS (
      SELECT d."id", d."tenant_id"
      FROM "crm_deals" d
      JOIN "crm_leads" l
        ON l."tenant_id" = d."tenant_id"
        AND l."id" = d."lead_id"
      JOIN "tenants" t
        ON t."id" = d."tenant_id"
      WHERE d."current_stage_id" IS NULL
        AND l."branch_id" IS NOT NULL
        AND t."currency" ~ '^[A-Z]{3}$'
      ORDER BY d."created_at", d."id"
      LIMIT backfill_batch_size
    )
    UPDATE "crm_deals" d
    SET
      "branch_id" = l."branch_id",
      "pipeline_id" = 'crm04_default_pipeline:' || d."tenant_id" || ':' || l."branch_id",
      "current_stage_id" =
        'crm04_stage:' || d."tenant_id" || ':' || l."branch_id" || ':' ||
        CASE d."stage"
          WHEN 'negotiation' THEN 'negotiation'
          WHEN 'closed_won' THEN 'closed_won'
          WHEN 'closed_lost' THEN 'closed_lost'
          ELSE 'proposal'
        END,
      "forecast_category" = CASE
        WHEN d."stage" IN ('closed_won', 'closed_lost') THEN 'closed'
        ELSE 'pipeline'
      END,
      "currency_code" = t."currency",
      "value_amount_minor" = COALESCE(d."value_cents", 0),
      "updated_at" = now()
    FROM candidate c, "crm_leads" l, "tenants" t
    WHERE d."id" = c."id"
      AND d."tenant_id" = c."tenant_id"
      AND l."tenant_id" = c."tenant_id"
      AND l."id" = d."lead_id"
      AND t."id" = c."tenant_id";

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    EXIT WHEN updated_count = 0;
  END LOOP;
END
$$;--> statement-breakpoint
INSERT INTO "crm_deal_stage_history" (
  "id",
  "tenant_id",
  "deal_id",
  "pipeline_id",
  "from_stage_id",
  "to_stage_id",
  "kind",
  "actor_id",
  "loss_reason_id",
  "reason",
  "idempotency_key",
  "metadata",
  "occurred_at",
  "created_at"
)
SELECT
  'crm04_stage_history:' || d."id",
  d."tenant_id",
  d."id",
  d."pipeline_id",
  NULL,
  d."current_stage_id",
  'created',
  d."agent_id",
  NULL,
  'crm04_backfill',
  NULL,
  jsonb_build_object('source', 'crm04_backfill', 'legacyStage', d."stage"),
  COALESCE(d."created_at", now()),
  now()
FROM "crm_deals" d
WHERE d."pipeline_id" IS NOT NULL
  AND d."current_stage_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
  crm_table text;
BEGIN
  FOREACH crm_table IN ARRAY ARRAY[
    'crm_pipelines',
    'crm_pipeline_stages',
    'crm_loss_reasons',
    'crm_deal_stage_history',
    'crm_deal_backfill_quarantine'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', crm_table);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = crm_table
        AND policyname = 'tenant_isolation_' || crm_table
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
        'tenant_isolation_' || crm_table,
        crm_table,
        current_tenant_setting,
        current_tenant_setting
      );
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
RESET statement_timeout;
