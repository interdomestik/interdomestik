ALTER TYPE "public"."status" ADD VALUE IF NOT EXISTS 'submitted_to_airline' AFTER 'submitted';
--> statement-breakpoint
ALTER TABLE "claim" DROP CONSTRAINT IF EXISTS "claim_recovery_lifecycle_state_check";
--> statement-breakpoint
ALTER TABLE "claim" ADD CONSTRAINT "claim_recovery_lifecycle_state_check"
  CHECK (
    "claim"."recovery_lifecycle_state" is null
    or "claim"."recovery_lifecycle_state" in (
      'not_started',
      'submitted_to_airline',
      'negotiation',
      'court',
      'resolved',
      'closed'
    )
  ) NOT VALID;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claim_transition_evidence" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "access_tenant_id" text,
  "claim_id" text NOT NULL,
  "evidence_type" text NOT NULL,
  "evidence_status" text NOT NULL,
  "recorded_by_id" text,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_document_id" text,
  "reference_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "claim_transition_evidence_type_check"
    CHECK ("evidence_type" in (
      'assignment_signed',
      'poa_signed',
      'airline_submission_consent',
      'vehicle_valuation_delta',
      'service_consent',
      'medical_consent',
      'human_review'
    )),
  CONSTRAINT "claim_transition_evidence_status_check"
    CHECK ("evidence_status" in ('accepted', 'signed', 'reviewed', 'revoked'))
);
--> statement-breakpoint
ALTER TABLE "claim_transition_evidence"
  ADD CONSTRAINT "claim_transition_evidence_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_transition_evidence"
  ADD CONSTRAINT "claim_transition_evidence_access_tenant_id_tenants_id_fk"
  FOREIGN KEY ("access_tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_transition_evidence"
  ADD CONSTRAINT "claim_transition_evidence_claim_id_claim_id_fk"
  FOREIGN KEY ("claim_id") REFERENCES "public"."claim"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_transition_evidence"
  ADD CONSTRAINT "claim_transition_evidence_recorded_by_id_user_id_fk"
  FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_transition_evidence"
  ADD CONSTRAINT "claim_transition_evidence_source_document_id_claim_documents_id_fk"
  FOREIGN KEY ("source_document_id") REFERENCES "public"."claim_documents"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_transition_evidence_claim_type_uq"
  ON "claim_transition_evidence" USING btree ("tenant_id","claim_id","evidence_type")
  WHERE "evidence_status" <> 'revoked';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_transition_evidence_access_tenant_idx"
  ON "claim_transition_evidence" USING btree ("access_tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_transition_evidence_claim_idx"
  ON "claim_transition_evidence" USING btree ("tenant_id","claim_id");
--> statement-breakpoint
ALTER TABLE public."claim_transition_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolation_claim_transition_evidence"
  ON public."claim_transition_evidence";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_write_claim_transition_evidence"
  ON public."claim_transition_evidence";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_update_claim_transition_evidence"
  ON public."claim_transition_evidence";
--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_delete_claim_transition_evidence"
  ON public."claim_transition_evidence";
--> statement-breakpoint
DO $$
DECLARE
  table_name constant text := 'claim_transition_evidence';
  read_expr constant text :=
    'coalesce(access_tenant_id, tenant_id) = (select current_setting(''app.current_access_tenant_id'', true))::text';
  write_expr constant text :=
    'tenant_id = (select current_setting(''app.current_access_tenant_id'', true))::text';
BEGIN
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT USING (%s)',
    'tenant_isolation_claim_transition_evidence',
    table_name,
    read_expr
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (%s)',
    'tenant_write_claim_transition_evidence',
    table_name,
    write_expr
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE USING (%s) WITH CHECK (%s)',
    'tenant_update_claim_transition_evidence',
    table_name,
    write_expr,
    write_expr
  );
END $$;
