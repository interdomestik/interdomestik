CREATE TABLE "free_start_drafts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"access_tenant_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"client_request_id" uuid NOT NULL,
	"category" text NOT NULL,
	"issue_type" text,
	"incident_date" date,
	"counterparty" varchar(160),
	"desired_outcome" text,
	"summary" varchar(1000),
	"resume_step" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "free_start_drafts_tenant_access_check" CHECK ("free_start_drafts"."tenant_id" = "free_start_drafts"."access_tenant_id"),
	CONSTRAINT "free_start_drafts_issue_matrix_check" CHECK (("free_start_drafts"."category" = 'vehicle' and ("free_start_drafts"."issue_type" is null or "free_start_drafts"."issue_type" in ('collision','theft','parking_damage','insurer_delay')))
          or ("free_start_drafts"."category" = 'property' and ("free_start_drafts"."issue_type" is null or "free_start_drafts"."issue_type" in ('water_damage','storm_fire','burglary','landlord_dispute')))),
	CONSTRAINT "free_start_drafts_outcome_check" CHECK ("free_start_drafts"."desired_outcome" is null or "free_start_drafts"."desired_outcome" in ('repair','reimbursement','compensation','written_response')),
	CONSTRAINT "free_start_drafts_resume_step_check" CHECK ("free_start_drafts"."resume_step" in ('category','details','preview')),
	CONSTRAINT "free_start_drafts_version_check" CHECK ("free_start_drafts"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "free_start_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "free_start_drafts" ADD CONSTRAINT "free_start_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_start_drafts" ADD CONSTRAINT "free_start_drafts_access_tenant_id_tenants_id_fk" FOREIGN KEY ("access_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "free_start_drafts" ADD CONSTRAINT "free_start_drafts_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "free_start_drafts_owner_request_uq" ON "free_start_drafts" USING btree ("access_tenant_id","owner_user_id","client_request_id");--> statement-breakpoint
CREATE INDEX "free_start_drafts_owner_updated_idx" ON "free_start_drafts" USING btree ("access_tenant_id","owner_user_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE POLICY "free_start_drafts_owner_access_policy" ON "free_start_drafts" AS PERMISSIVE FOR ALL TO public USING ("free_start_drafts"."access_tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
      and "free_start_drafts"."owner_user_id" = (select current_setting('app.current_actor_id', true))::text) WITH CHECK ("free_start_drafts"."access_tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
      and "free_start_drafts"."owner_user_id" = (select current_setting('app.current_actor_id', true))::text);
