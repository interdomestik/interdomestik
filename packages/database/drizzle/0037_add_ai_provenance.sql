CREATE TABLE "ai_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workflow" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"document_id" text,
	"entity_type" text,
	"entity_id" text,
	"requested_by" text,
	"model" text NOT NULL,
	"model_snapshot" text,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"request_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_json" jsonb,
	"output_json" jsonb,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cached_input_tokens" integer,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_extractions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"document_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"workflow" text NOT NULL,
	"schema_version" text NOT NULL,
	"extracted_json" jsonb NOT NULL,
	"confidence" numeric(5, 4),
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_run_id" text NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_source_run_id_ai_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."ai_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_runs_tenant_workflow_status" ON "ai_runs" USING btree ("tenant_id","workflow","status");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_document" ON "ai_runs" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_tenant_entity" ON "ai_runs" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_requested_by" ON "ai_runs" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_created_at" ON "ai_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_document_extractions_tenant_document" ON "document_extractions" USING btree ("tenant_id","document_id");--> statement-breakpoint
CREATE INDEX "idx_document_extractions_tenant_entity" ON "document_extractions" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_document_extractions_workflow" ON "document_extractions" USING btree ("workflow");--> statement-breakpoint
CREATE INDEX "idx_document_extractions_review_status" ON "document_extractions" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_document_extractions_source_run" ON "document_extractions" USING btree ("source_run_id");--> statement-breakpoint
ALTER TABLE public."ai_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."document_extractions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_runs'
      AND policyname = 'tenant_isolation_ai_runs'
  ) THEN
    CREATE POLICY "tenant_isolation_ai_runs" ON public."ai_runs"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_extractions'
      AND policyname = 'tenant_isolation_document_extractions'
  ) THEN
    CREATE POLICY "tenant_isolation_document_extractions" ON public."document_extractions"
      USING (tenant_id = current_setting('app.current_tenant_id', true)::text)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::text);
  END IF;
END
$$;
