CREATE TABLE "claim_information_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"requested_information" varchar(1000) NOT NULL,
	"explanation_for_member" varchar(1000) NOT NULL,
	"due_at" timestamp (3) with time zone NOT NULL,
	"responsible_staff_id" text NOT NULL,
	"created_by_staff_id" text NOT NULL,
	"sla_posture" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_information_requests_text_check" CHECK (length(btrim("claim_information_requests"."requested_information")) > 0 and length(btrim("claim_information_requests"."explanation_for_member")) > 0),
	CONSTRAINT "claim_information_requests_posture_check" CHECK ("claim_information_requests"."sla_posture" = 'incomplete' and "claim_information_requests"."status" = 'open'),
	CONSTRAINT "claim_information_requests_owner_check" CHECK ("claim_information_requests"."responsible_staff_id" = "claim_information_requests"."created_by_staff_id")
);
--> statement-breakpoint
ALTER TABLE "claim_information_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "engagement_email_sends" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "engagement_email_sends" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "billing_invoices" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "billing_invoices" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "free_start_drafts" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "free_start_drafts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "free_start_drafts" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "free_start_drafts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_responsible_staff_id_user_id_fk" FOREIGN KEY ("responsible_staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_information_requests" ADD CONSTRAINT "claim_information_requests_created_by_staff_id_user_id_fk" FOREIGN KEY ("created_by_staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_information_requests_correlation_uq" ON "claim_information_requests" USING btree ("tenant_id","correlation_id");--> statement-breakpoint
CREATE INDEX "claim_information_requests_claim_idx" ON "claim_information_requests" USING btree ("tenant_id","claim_id","created_at");--> statement-breakpoint
CREATE POLICY "claim_information_requests_tenant_policy" ON "claim_information_requests" AS PERMISSIVE FOR ALL TO public USING ("claim_information_requests"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text) WITH CHECK ("claim_information_requests"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text and exists (select 1 from "claim" c where c.id = "claim_information_requests"."claim_id" and c.tenant_id = "claim_information_requests"."tenant_id"));