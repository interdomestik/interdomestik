CREATE TABLE "support_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"member_id" text NOT NULL,
	"branch_id" text,
	"claim_id" text,
	"source" text DEFAULT 'member_help' NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"contact_preference" text DEFAULT 'staff_reply' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"urgency" text NOT NULL,
	"trust_risk" text NOT NULL,
	"staff_id" text,
	"accepted_at" timestamp,
	"accepted_by_id" text,
	"reassigned_at" timestamp,
	"reassigned_by_id" text,
	"reassign_reason" text,
	"closed_at" timestamp,
	"closed_by_id" text,
	"close_reason" text,
	"lifecycle_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_member_id_user_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_staff_id_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_accepted_by_id_user_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_reassigned_by_id_user_id_fk" FOREIGN KEY ("reassigned_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD CONSTRAINT "support_handoffs_closed_by_id_user_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_handoffs_tenant_status_created_idx" ON "support_handoffs" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "support_handoffs_tenant_branch_status_created_idx" ON "support_handoffs" USING btree ("tenant_id","branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "support_handoffs_tenant_staff_status_created_idx" ON "support_handoffs" USING btree ("tenant_id","staff_id","status","created_at");--> statement-breakpoint
CREATE INDEX "support_handoffs_tenant_claim_idx" ON "support_handoffs" USING btree ("tenant_id","claim_id");--> statement-breakpoint
CREATE INDEX "support_handoffs_tenant_member_created_idx" ON "support_handoffs" USING btree ("tenant_id","member_id","created_at");--> statement-breakpoint
ALTER TABLE public."support_handoffs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  current_tenant_setting constant text := 'app.current_tenant_id';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_handoffs'
      AND policyname = 'tenant_isolation_support_handoffs'
  ) THEN
    EXECUTE format(
      'CREATE POLICY "tenant_isolation_support_handoffs" ON public."support_handoffs" USING (tenant_id = current_setting(%L, true)::text) WITH CHECK (tenant_id = current_setting(%L, true)::text)',
      current_tenant_setting,
      current_tenant_setting
    );
  END IF;
END
$$;
