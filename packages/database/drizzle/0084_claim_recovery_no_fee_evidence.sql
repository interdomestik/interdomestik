CREATE TABLE "claim_recovery_no_fee_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "claim_id" text NOT NULL,
  "reason_code" text NOT NULL,
  "reason" text,
  "documented_by_id" text NOT NULL,
  "documented_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "claim_recovery_no_fee_evidence_reason_code_check"
    CHECK ("reason_code" in ('no_recovery', 'not_billable_under_recovery_scope'))
);
--> statement-breakpoint
ALTER TABLE "claim_recovery_no_fee_evidence" ADD CONSTRAINT "claim_recovery_no_fee_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_recovery_no_fee_evidence" ADD CONSTRAINT "claim_recovery_no_fee_evidence_claim_id_claim_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_recovery_no_fee_evidence" ADD CONSTRAINT "claim_recovery_no_fee_evidence_documented_by_id_user_id_fk" FOREIGN KEY ("documented_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "claim_recovery_no_fee_evidence_claim_uq" ON "claim_recovery_no_fee_evidence" USING btree ("tenant_id","claim_id");
--> statement-breakpoint
CREATE INDEX "claim_recovery_no_fee_evidence_tenant_idx" ON "claim_recovery_no_fee_evidence" USING btree ("tenant_id");
--> statement-breakpoint
ALTER TABLE public."claim_recovery_no_fee_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  policy_name constant text := 'tenant_isolation_claim_recovery_no_fee_evidence';
  policy_expr constant text :=
    'tenant_id = (select current_setting(''app.current_access_tenant_id'', true))::text';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'claim_recovery_no_fee_evidence'
      AND policyname = policy_name
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON public."claim_recovery_no_fee_evidence" USING (%s) WITH CHECK (%s)',
      policy_name,
      policy_expr,
      policy_expr
    );
  END IF;
END;
$$;
