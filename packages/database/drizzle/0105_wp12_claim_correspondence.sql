-- WP-12 (design v14.1). Expand only: new tables, SQL-managed keys and guards; no DML on any
-- existing table. The claim key index is SQL-only (WP-11 creates the same index; whichever
-- lands second drops its copy).
CREATE UNIQUE INDEX "claim_tenant_id_id_uq" ON "claim" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE TABLE "claim_authorities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope" text NOT NULL,
	"evidence_document_id" text NOT NULL,
	"evidence_bucket" text NOT NULL,
	"evidence_file_path" text NOT NULL,
	"version" varchar(50) NOT NULL,
	"jurisdiction_country_code" text,
	"jurisdiction_attested_by_user_id" text,
	"jurisdiction_attested_at" timestamp (3) with time zone,
	"purpose" varchar(500),
	"granted_at" timestamp (3) with time zone NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"revoked_by_user_id" text,
	"recorded_by_staff_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_authorities_kind_check" CHECK ("claim_authorities"."kind" in ('recovery_agreement', 'power_of_attorney', 'signed_assignment', 'consent_or_lawful_basis')),
	CONSTRAINT "claim_authorities_scope_check" CHECK ("claim_authorities"."scope" in ('recovery', 'representation', 'document_sharing')),
	CONSTRAINT "claim_authorities_kind_scope_check" CHECK (("claim_authorities"."kind" in ('recovery_agreement', 'signed_assignment') and "claim_authorities"."scope" = 'recovery')
        or ("claim_authorities"."kind" = 'power_of_attorney' and "claim_authorities"."scope" = 'representation')
        or ("claim_authorities"."kind" = 'consent_or_lawful_basis' and "claim_authorities"."scope" = 'document_sharing')),
	CONSTRAINT "claim_authorities_version_check" CHECK ("claim_authorities"."version" ~ '\S'),
	CONSTRAINT "claim_authorities_jurisdiction_check" CHECK (("claim_authorities"."kind" = 'power_of_attorney') = ("claim_authorities"."jurisdiction_country_code" is not null)
        and ("claim_authorities"."jurisdiction_country_code" is null or "claim_authorities"."jurisdiction_country_code" ~ '^[A-Z]{2}$')
        and ("claim_authorities"."kind" = 'power_of_attorney') = ("claim_authorities"."jurisdiction_attested_by_user_id" is not null)
        and ("claim_authorities"."kind" = 'power_of_attorney') = ("claim_authorities"."jurisdiction_attested_at" is not null)),
	CONSTRAINT "claim_authorities_purpose_check" CHECK (("claim_authorities"."kind" = 'consent_or_lawful_basis') = ("claim_authorities"."purpose" is not null)
        and ("claim_authorities"."purpose" is null or "claim_authorities"."purpose" ~ '\S')),
	CONSTRAINT "claim_authorities_expiry_check" CHECK ("claim_authorities"."expires_at" is null or "claim_authorities"."expires_at" > "claim_authorities"."granted_at"),
	CONSTRAINT "claim_authorities_revocation_check" CHECK (("claim_authorities"."revoked_at" is null) = ("claim_authorities"."revoked_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "claim_authorities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_case_fields" (
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"other_vehicle_country_code" text,
	"insurance_proof_reference" varchar(200),
	"outside_handling_party" varchar(200),
	"coverage_verification_status" text DEFAULT 'not_checked' NOT NULL,
	"case_follow_up_at" timestamp (3) with time zone,
	"updated_by_staff_id" text NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_case_fields_country_check" CHECK ("claim_case_fields"."other_vehicle_country_code" is null or "claim_case_fields"."other_vehicle_country_code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "claim_case_fields_insurance_reference_check" CHECK ("claim_case_fields"."insurance_proof_reference" is null or "claim_case_fields"."insurance_proof_reference" ~ '\S'),
	CONSTRAINT "claim_case_fields_coverage_check" CHECK ("claim_case_fields"."coverage_verification_status" in ('not_checked', 'requested', 'confirmed_by_party', 'refused_by_party'))
);
--> statement-breakpoint
ALTER TABLE "claim_case_fields" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_correspondence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"party_kind" text NOT NULL,
	"party_organisation" varchar(200) NOT NULL,
	"party_reference" varchar(200),
	"party_contact_name" varchar(200),
	"channel" text NOT NULL,
	"occurred_at" timestamp (3) with time zone NOT NULL,
	"body" varchar(4000) NOT NULL,
	"in_reply_to_id" uuid,
	"recovery_authority_id" uuid,
	"representation_authority_id" uuid,
	"sharing_authority_id" uuid,
	"shared_document_count" integer DEFAULT 0 NOT NULL,
	"sharing_attested_by_user_id" text,
	"sharing_attested_at" timestamp (3) with time zone,
	"follow_up_at" timestamp (3) with time zone,
	"decided_at" timestamp (3) with time zone,
	"recorded_by_staff_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_correspondence_direction_check" CHECK ("claim_correspondence"."direction" in ('outbound', 'inbound')),
	CONSTRAINT "claim_correspondence_party_kind_check" CHECK ("claim_correspondence"."party_kind" in ('insurer', 'bureau', 'other')),
	CONSTRAINT "claim_correspondence_channel_check" CHECK ("claim_correspondence"."channel" in ('email', 'post', 'phone', 'portal', 'other')),
	CONSTRAINT "claim_correspondence_organisation_check" CHECK ("claim_correspondence"."party_organisation" ~ '\S'),
	CONSTRAINT "claim_correspondence_body_check" CHECK ("claim_correspondence"."body" ~ '\S'),
	CONSTRAINT "claim_correspondence_reply_direction_check" CHECK ("claim_correspondence"."in_reply_to_id" is null or "claim_correspondence"."direction" = 'inbound'),
	CONSTRAINT "claim_correspondence_document_count_check" CHECK ("claim_correspondence"."shared_document_count" between 0 and 20),
	CONSTRAINT "claim_correspondence_sharing_check" CHECK (("claim_correspondence"."sharing_authority_id" is not null) = ("claim_correspondence"."shared_document_count" > 0)
        and ("claim_correspondence"."sharing_authority_id" is not null) = ("claim_correspondence"."sharing_attested_by_user_id" is not null)
        and ("claim_correspondence"."sharing_authority_id" is not null) = ("claim_correspondence"."sharing_attested_at" is not null)
        and ("claim_correspondence"."sharing_authority_id" is null or "claim_correspondence"."direction" = 'outbound')),
	CONSTRAINT "claim_correspondence_outbound_check" CHECK ("claim_correspondence"."direction" <> 'outbound' or ("claim_correspondence"."recovery_authority_id" is not null and "claim_correspondence"."representation_authority_id" is not null and "claim_correspondence"."decided_at" is not null)),
	CONSTRAINT "claim_correspondence_inbound_check" CHECK ("claim_correspondence"."direction" <> 'inbound' or ("claim_correspondence"."recovery_authority_id" is null and "claim_correspondence"."representation_authority_id" is null
        and "claim_correspondence"."sharing_authority_id" is null and "claim_correspondence"."shared_document_count" = 0
        and "claim_correspondence"."sharing_attested_by_user_id" is null and "claim_correspondence"."sharing_attested_at" is null
        and "claim_correspondence"."follow_up_at" is null and "claim_correspondence"."decided_at" is null))
);
--> statement-breakpoint
ALTER TABLE "claim_correspondence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_correspondence_documents" (
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correspondence_id" uuid NOT NULL,
	"claim_document_id" text NOT NULL,
	"document_bucket" text NOT NULL,
	"document_file_path" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_correspondence_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_authorities_correlation_uq" ON "claim_authorities" USING btree ("tenant_id","correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_authorities_tenant_claim_id_uq" ON "claim_authorities" USING btree ("tenant_id","claim_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_authorities_claim_kind_uq" ON "claim_authorities" USING btree ("tenant_id","claim_id","kind");--> statement-breakpoint
CREATE INDEX "claim_authorities_claim_idx" ON "claim_authorities" USING btree ("tenant_id","claim_id","created_at");--> statement-breakpoint
CREATE INDEX "claim_authorities_evidence_idx" ON "claim_authorities" USING btree ("tenant_id","claim_id","evidence_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_case_fields_claim_uq" ON "claim_case_fields" USING btree ("tenant_id","claim_id");--> statement-breakpoint
CREATE INDEX "claim_case_fields_follow_up_idx" ON "claim_case_fields" USING btree ("tenant_id","case_follow_up_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_correspondence_correlation_uq" ON "claim_correspondence" USING btree ("tenant_id","correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_correspondence_tenant_claim_id_uq" ON "claim_correspondence" USING btree ("tenant_id","claim_id","id");--> statement-breakpoint
CREATE INDEX "claim_correspondence_claim_idx" ON "claim_correspondence" USING btree ("tenant_id","claim_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "claim_correspondence_reply_idx" ON "claim_correspondence" USING btree ("tenant_id","claim_id","in_reply_to_id");--> statement-breakpoint
CREATE INDEX "claim_correspondence_documents_entry_idx" ON "claim_correspondence_documents" USING btree ("tenant_id","claim_id","correspondence_id");--> statement-breakpoint
CREATE INDEX "claim_correspondence_documents_document_idx" ON "claim_correspondence_documents" USING btree ("tenant_id","claim_id","claim_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_correspondence_documents_entry_uq" ON "claim_correspondence_documents" USING btree ("correspondence_id","claim_document_id");--> statement-breakpoint
ALTER TABLE "claim_authorities" ADD CONSTRAINT "claim_authorities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_authorities" ADD CONSTRAINT "claim_authorities_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_authorities" ADD CONSTRAINT "claim_authorities_recorded_by_fk" FOREIGN KEY ("tenant_id","recorded_by_staff_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_authorities" ADD CONSTRAINT "claim_authorities_revoked_by_fk" FOREIGN KEY ("tenant_id","revoked_by_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_authorities" ADD CONSTRAINT "claim_authorities_jurisdiction_attested_by_fk" FOREIGN KEY ("tenant_id","jurisdiction_attested_by_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_case_fields" ADD CONSTRAINT "claim_case_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_case_fields" ADD CONSTRAINT "claim_case_fields_updated_by_fk" FOREIGN KEY ("tenant_id","updated_by_staff_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_reply_fk" FOREIGN KEY ("tenant_id","claim_id","in_reply_to_id") REFERENCES "public"."claim_correspondence"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_recovery_authority_fk" FOREIGN KEY ("tenant_id","claim_id","recovery_authority_id") REFERENCES "public"."claim_authorities"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_representation_authority_fk" FOREIGN KEY ("tenant_id","claim_id","representation_authority_id") REFERENCES "public"."claim_authorities"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_sharing_authority_fk" FOREIGN KEY ("tenant_id","claim_id","sharing_authority_id") REFERENCES "public"."claim_authorities"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_recorded_by_fk" FOREIGN KEY ("tenant_id","recorded_by_staff_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence" ADD CONSTRAINT "claim_correspondence_sharing_attested_by_fk" FOREIGN KEY ("tenant_id","sharing_attested_by_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence_documents" ADD CONSTRAINT "claim_correspondence_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence_documents" ADD CONSTRAINT "claim_correspondence_documents_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence_documents" ADD CONSTRAINT "claim_correspondence_documents_correspondence_fk" FOREIGN KEY ("tenant_id","claim_id","correspondence_id") REFERENCES "public"."claim_correspondence"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "claim_authorities_tenant_policy" ON "claim_authorities" AS PERMISSIVE FOR ALL TO public USING ("claim_authorities"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_authorities"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_authorities"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_authorities"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = "claim_authorities"."claim_id" and c.tenant_id = "claim_authorities"."tenant_id"));--> statement-breakpoint
CREATE POLICY "claim_case_fields_tenant_policy" ON "claim_case_fields" AS PERMISSIVE FOR ALL TO public USING ("claim_case_fields"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_case_fields"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = "claim_case_fields"."claim_id" and c.tenant_id = "claim_case_fields"."tenant_id")) WITH CHECK ("claim_case_fields"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_case_fields"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = "claim_case_fields"."claim_id" and c.tenant_id = "claim_case_fields"."tenant_id"));--> statement-breakpoint
CREATE POLICY "claim_correspondence_tenant_policy" ON "claim_correspondence" AS PERMISSIVE FOR ALL TO public USING ("claim_correspondence"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_correspondence"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = "claim_correspondence"."claim_id" and c.tenant_id = "claim_correspondence"."tenant_id"));--> statement-breakpoint
CREATE POLICY "claim_correspondence_documents_tenant_policy" ON "claim_correspondence_documents" AS PERMISSIVE FOR ALL TO public USING ("claim_correspondence_documents"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence_documents"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_correspondence_documents"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence_documents"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text
        and exists (select 1 from "claim" c where c.id = "claim_correspondence_documents"."claim_id" and c.tenant_id = "claim_correspondence_documents"."tenant_id"));
--> statement-breakpoint
ALTER TABLE "claim_authorities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "claim_correspondence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "claim_correspondence_documents" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "claim_case_fields" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Case fields are current state of the claim and disappear with it.
ALTER TABLE "claim_case_fields" ADD CONSTRAINT "claim_case_fields_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
-- RESTRICT is checked immediately and cannot be deferred: a cited document cannot be deleted,
-- not even when the same statement inserts a replacement with the same key.
ALTER TABLE "claim_authorities" ADD CONSTRAINT "claim_authorities_evidence_document_fk" FOREIGN KEY ("tenant_id","claim_id","evidence_document_id") REFERENCES "public"."claim_documents"("tenant_id","claim_id","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE "claim_correspondence_documents" ADD CONSTRAINT "claim_correspondence_documents_document_fk" FOREIGN KEY ("tenant_id","claim_id","claim_document_id") REFERENCES "public"."claim_documents"("tenant_id","claim_id","id") ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
CREATE INDEX "claim_correspondence_follow_up_idx" ON "claim_correspondence" USING btree ("tenant_id","follow_up_at") WHERE "direction" = 'outbound' AND "follow_up_at" IS NOT NULL;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE
  ON public.claim_authorities, public.claim_correspondence, public.claim_correspondence_documents,
  public.claim_case_fields FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.claim_authorities, public.claim_correspondence,
      public.claim_correspondence_documents, public.claim_case_fields FROM interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.claim_authorities, public.claim_correspondence,
      public.claim_correspondence_documents, public.claim_case_fields TO interdomestik_runtime_rls;
    GRANT UPDATE (other_vehicle_country_code, insurance_proof_reference, outside_handling_party,
      coverage_verification_status, case_follow_up_at, updated_by_staff_id, updated_at)
      ON public.claim_case_fields TO interdomestik_runtime_rls;
    GRANT UPDATE (revoked_at, revoked_by_user_id) ON public.claim_authorities TO interdomestik_runtime_rls;
    GRANT UPDATE (follow_up_at) ON public.claim_correspondence TO interdomestik_runtime_rls;
  END IF;
END;
$$;
--> statement-breakpoint
-- The storage coordinates of a case document never change (R-35, no overwrite). AFTER ROW sees
-- the final row after every BEFORE trigger; it reads nothing, so no RLS can hide anything from it.
CREATE FUNCTION public.claim_documents_coordinates_frozen_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.claim_id IS DISTINCT FROM OLD.claim_id
    OR NEW.id IS DISTINCT FROM OLD.id OR NEW.bucket IS DISTINCT FROM OLD.bucket
    OR NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    RAISE EXCEPTION USING ERRCODE = 'P1203', MESSAGE = 'Case document storage coordinates cannot change';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_documents_coordinates_frozen AFTER UPDATE ON public.claim_documents
FOR EACH ROW EXECUTE FUNCTION public.claim_documents_coordinates_frozen_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_document_provenance_ok(p_tenant_id text, p_claim_id text, p_document_id text)
RETURNS boolean
LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path = pg_catalog, pg_temp
BEGIN ATOMIC
  SELECT EXISTS (
    SELECT 1
    FROM public.claim_documents AS d
    WHERE d.tenant_id = p_tenant_id AND d.claim_id = p_claim_id AND d.id = p_document_id
      AND d.bucket = 'claim-evidence'
      AND d.tenant_id COLLATE pg_catalog."C" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
      AND d.claim_id COLLATE pg_catalog."C" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
      AND d.id COLLATE pg_catalog."C" ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
      AND strpos(d.tenant_id, '..') = 0 AND strpos(d.claim_id, '..') = 0 AND strpos(d.id, '..') = 0
      AND d.file_path = 'pii/tenants/' || d.tenant_id || '/claims/' || d.claim_id || '/' || d.id
        || substring(d.file_path COLLATE pg_catalog."C" FROM '[.][a-z0-9]{1,16}$')
  );
END;
--> statement-breakpoint
CREATE FUNCTION public.claim_basis_jurisdiction_appropriate(p_tenant_id text, p_claim_id text, p_authority_id uuid)
RETURNS boolean
LANGUAGE sql STABLE STRICT SECURITY INVOKER SET search_path = pg_catalog, pg_temp
BEGIN ATOMIC
  SELECT EXISTS (
    SELECT 1
    FROM public.claim_authorities AS a
    WHERE a.tenant_id = p_tenant_id AND a.claim_id = p_claim_id AND a.id = p_authority_id
      AND a.kind = 'power_of_attorney' AND a.jurisdiction_country_code IS NOT NULL
      AND a.jurisdiction_attested_by_user_id IS NOT NULL AND a.jurisdiction_attested_at IS NOT NULL
  );
END;
--> statement-breakpoint
CREATE FUNCTION public.claim_authorities_insert_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  document public.claim_documents%ROWTYPE;
BEGIN
  PERFORM c.id FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id AND c.case_lifecycle_state <> 'draft'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P1201', MESSAGE = 'A visible non-draft claim is required';
  END IF;

  SELECT d.* INTO document FROM public.claim_documents AS d
    WHERE d.tenant_id = NEW.tenant_id AND d.claim_id = NEW.claim_id AND d.id = NEW.evidence_document_id
    FOR SHARE;
  IF NOT FOUND OR NEW.evidence_bucket IS DISTINCT FROM document.bucket
    OR NEW.evidence_file_path IS DISTINCT FROM document.file_path
    OR NOT public.claim_document_provenance_ok(NEW.tenant_id, NEW.claim_id, NEW.evidence_document_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1203', MESSAGE = 'Authority evidence must match an assigned claim document';
  END IF;

  IF NEW.granted_at > clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'P1202', MESSAGE = 'An authority grant cannot be future-dated';
  END IF;
  -- Revocation is recorded only by the revoke guard with the server clock, never on insert.
  IF NEW.revoked_at IS NOT NULL OR NEW.revoked_by_user_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P1204', MESSAGE = 'A new claim authority cannot carry a revocation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_authorities_insert_guard BEFORE INSERT ON public.claim_authorities
FOR EACH ROW EXECUTE FUNCTION public.claim_authorities_insert_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_authorities_revoke_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  revoking_user_id text := NEW.revoked_by_user_id;
BEGIN
  PERFORM c.id FROM public.claim AS c
    WHERE c.tenant_id = OLD.tenant_id AND c.id = OLD.claim_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P1201', MESSAGE = 'A visible claim is required for revocation';
  END IF;

  NEW.revoked_at := OLD.revoked_at;
  NEW.revoked_by_user_id := OLD.revoked_by_user_id;
  IF NEW IS DISTINCT FROM OLD OR OLD.revoked_at IS NOT NULL OR revoking_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P1205', MESSAGE = 'A claim authority permits one revocation only';
  END IF;
  NEW.revoked_at := clock_timestamp();
  NEW.revoked_by_user_id := revoking_user_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_authorities_revoke_guard BEFORE UPDATE ON public.claim_authorities
FOR EACH ROW EXECUTE FUNCTION public.claim_authorities_revoke_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_correspondence_insert_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  authorities public.claim_authorities[];
  authority public.claim_authorities%ROWTYPE;
  decision_at timestamptz;
  recovery_ok boolean := false;
  representation_ok boolean := false;
  sharing_ok boolean := NEW.sharing_authority_id IS NULL;
BEGIN
  PERFORM c.id FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id AND c.case_lifecycle_state <> 'draft'
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P1201', MESSAGE = 'A visible non-draft claim is required';
  END IF;

  IF NEW.direction IS DISTINCT FROM 'outbound' THEN
    IF NEW.in_reply_to_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.claim_correspondence AS reply
      WHERE reply.tenant_id = NEW.tenant_id AND reply.claim_id = NEW.claim_id
        AND reply.id = NEW.in_reply_to_id AND reply.direction = 'outbound'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P1204', MESSAGE = 'A reply must reference an outbound record of this claim';
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(array_agg(locked.authority), '{}') INTO authorities FROM (
    SELECT a AS authority FROM public.claim_authorities AS a
    WHERE a.tenant_id = NEW.tenant_id AND a.claim_id = NEW.claim_id AND a.id IN (
      NEW.recovery_authority_id, NEW.representation_authority_id, NEW.sharing_authority_id
    )
    ORDER BY a.id FOR SHARE
  ) AS locked;
  decision_at := clock_timestamp();

  FOREACH authority IN ARRAY authorities LOOP
    IF authority.revoked_at IS NOT NULL OR authority.granted_at > decision_at
      OR (authority.expires_at IS NOT NULL AND authority.expires_at <= decision_at) THEN
      CONTINUE;
    END IF;
    IF authority.id = NEW.recovery_authority_id THEN
      recovery_ok := authority.kind = 'recovery_agreement' AND authority.scope = 'recovery';
    ELSIF authority.id = NEW.representation_authority_id THEN
      representation_ok := authority.kind = 'power_of_attorney' AND authority.scope = 'representation'
        AND COALESCE(public.claim_basis_jurisdiction_appropriate(NEW.tenant_id, NEW.claim_id, authority.id), false);
    ELSIF authority.id = NEW.sharing_authority_id THEN
      sharing_ok := authority.kind = 'consent_or_lawful_basis' AND authority.scope = 'document_sharing'
        AND authority.purpose ~ '\S';
    END IF;
  END LOOP;

  IF NOT (recovery_ok AND representation_ok AND sharing_ok) OR (
    NEW.shared_document_count > 0 AND (NEW.sharing_authority_id IS NULL
      OR NEW.sharing_attested_by_user_id IS NULL OR NEW.sharing_attested_at IS NULL)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1202', MESSAGE = 'Required outbound authorities are invalid';
  END IF;

  -- Preserve the decision ordering when persisting to millisecond precision.
  NEW.decided_at := date_trunc('milliseconds', decision_at);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_correspondence_insert_guard BEFORE INSERT ON public.claim_correspondence
FOR EACH ROW EXECUTE FUNCTION public.claim_correspondence_insert_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_correspondence_follow_up_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  follow_up_at timestamptz := NEW.follow_up_at;
BEGIN
  NEW.follow_up_at := OLD.follow_up_at;
  IF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION USING ERRCODE = 'P1205', MESSAGE = 'Only correspondence follow-up may be updated';
  END IF;
  NEW.follow_up_at := follow_up_at;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_correspondence_follow_up_guard BEFORE UPDATE ON public.claim_correspondence
FOR EACH ROW EXECUTE FUNCTION public.claim_correspondence_follow_up_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_register_reject_mutation_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = CASE WHEN TG_OP = 'UPDATE' THEN 'P1205' ELSE 'P1204' END,
    MESSAGE = format('%s is append-only', TG_TABLE_NAME);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_authorities_no_delete BEFORE DELETE ON public.claim_authorities
FOR EACH ROW EXECUTE FUNCTION public.claim_register_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER claim_correspondence_no_delete BEFORE DELETE ON public.claim_correspondence
FOR EACH ROW EXECUTE FUNCTION public.claim_register_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER claim_correspondence_documents_immutable BEFORE UPDATE OR DELETE ON public.claim_correspondence_documents
FOR EACH ROW EXECUTE FUNCTION public.claim_register_reject_mutation_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_correspondence_documents_insert_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  document public.claim_documents%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.claim_correspondence AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.claim_id = NEW.claim_id AND c.id = NEW.correspondence_id
      AND c.direction = 'outbound' AND c.sharing_authority_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1204', MESSAGE = 'A sent document requires an outbound record with a sharing basis';
  END IF;

  SELECT d.* INTO document FROM public.claim_documents AS d
    WHERE d.tenant_id = NEW.tenant_id AND d.claim_id = NEW.claim_id AND d.id = NEW.claim_document_id
    FOR SHARE;
  IF NOT FOUND OR NEW.document_bucket IS DISTINCT FROM document.bucket
    OR NEW.document_file_path IS DISTINCT FROM document.file_path
    OR NOT public.claim_document_provenance_ok(NEW.tenant_id, NEW.claim_id, NEW.claim_document_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1203', MESSAGE = 'A sent document must match an assigned claim document';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_correspondence_documents_insert_guard BEFORE INSERT ON public.claim_correspondence_documents
FOR EACH ROW EXECUTE FUNCTION public.claim_correspondence_documents_insert_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_correspondence_document_count_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  parent_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'claim_correspondence' THEN
    parent_id := NEW.id;
  ELSE
    parent_id := NEW.correspondence_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.claim_correspondence AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.claim_id = NEW.claim_id AND c.id = parent_id
      AND c.shared_document_count = (
        SELECT count(*) FROM public.claim_correspondence_documents AS d
        WHERE d.tenant_id = c.tenant_id AND d.claim_id = c.claim_id AND d.correspondence_id = c.id
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1205', MESSAGE = 'The sent-document count must match the correspondence record';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_correspondence_document_count AFTER INSERT ON public.claim_correspondence
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.claim_correspondence_document_count_fn();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_correspondence_documents_document_count AFTER INSERT ON public.claim_correspondence_documents
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.claim_correspondence_document_count_fn();
--> statement-breakpoint
-- The final citing row (after every BEFORE INSERT trigger) must still copy its document's storage.
CREATE FUNCTION public.claim_citation_copy_check_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  document_id text;
  copied_bucket text;
  copied_path text;
BEGIN
  IF TG_TABLE_NAME = 'claim_authorities' THEN
    document_id := NEW.evidence_document_id;
    copied_bucket := NEW.evidence_bucket;
    copied_path := NEW.evidence_file_path;
  ELSE
    document_id := NEW.claim_document_id;
    copied_bucket := NEW.document_bucket;
    copied_path := NEW.document_file_path;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.claim_documents AS d
    WHERE d.tenant_id = NEW.tenant_id AND d.claim_id = NEW.claim_id AND d.id = document_id
      AND d.bucket = copied_bucket AND d.file_path = copied_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1203', MESSAGE = 'A citation must copy its document storage';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_authorities_citation_copy_check AFTER INSERT ON public.claim_authorities
FOR EACH ROW EXECUTE FUNCTION public.claim_citation_copy_check_fn();
--> statement-breakpoint
CREATE TRIGGER claim_correspondence_documents_citation_copy_check AFTER INSERT ON public.claim_correspondence_documents
FOR EACH ROW EXECUTE FUNCTION public.claim_citation_copy_check_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_category_open_for_intake(p_category text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SECURITY INVOKER SET search_path = pg_catalog, pg_temp
BEGIN ATOMIC
  -- Match the whitespace trimmed by JavaScript String.prototype.trim().
  SELECT pg_catalog.lower(pg_catalog.btrim(
    p_category, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
  ) COLLATE pg_catalog."C") IN ('vehicle', 'property', 'travel');
END;
--> statement-breakpoint
CREATE FUNCTION public.claim_intake_category_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.category IS NOT DISTINCT FROM OLD.category
      AND NOT (OLD.case_lifecycle_state = 'draft' AND NEW.case_lifecycle_state <> 'draft') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF public.claim_category_open_for_intake(NEW.category) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P1204', MESSAGE = 'The claim category is closed for intake';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_intake_category_guard BEFORE INSERT OR UPDATE OF category, case_lifecycle_state ON public.claim
FOR EACH ROW EXECUTE FUNCTION public.claim_intake_category_guard_fn();
