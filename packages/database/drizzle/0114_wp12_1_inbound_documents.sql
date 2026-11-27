CREATE TABLE "claim_correspondence_received_documents" (
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correspondence_id" uuid NOT NULL,
	"claim_document_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_correspondence_received_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_correspondence_received_seals" (
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correspondence_id" uuid PRIMARY KEY NOT NULL,
	"document_count" integer NOT NULL,
	CONSTRAINT "claim_received_seals_count_check" CHECK ("claim_correspondence_received_seals"."document_count" between 0 and 20)
);
--> statement-breakpoint
ALTER TABLE "claim_correspondence_received_seals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_inbound_pilot_cases" (
	"tenant_id" text NOT NULL,
	"claim_id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"enrolled_at" timestamp (3) with time zone,
	"legacy_credential_disposition" text,
	CONSTRAINT "claim_inbound_pilot_cases_disposition_check" CHECK (("claim_inbound_pilot_cases"."legacy_credential_disposition" is null and "claim_inbound_pilot_cases"."enrolled_at" is null)
        or ("claim_inbound_pilot_cases"."legacy_credential_disposition" is not null
          and "claim_inbound_pilot_cases"."legacy_credential_disposition" in ('expired', 'invalidated', 'none-issued')))
);
--> statement-breakpoint
ALTER TABLE "claim_inbound_pilot_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "claim_inbound_upload_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"correlation_id" uuid NOT NULL,
	"classification" text NOT NULL,
	"decided_by" text NOT NULL,
	"role_basis" text NOT NULL,
	"decided_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"recipient_id" text NOT NULL,
	"uploader_id" text NOT NULL,
	"office_receipt_ref" varchar(128) NOT NULL,
	"document_id" text NOT NULL,
	"bucket" varchar(128) NOT NULL,
	"file_path" varchar(768) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	CONSTRAINT "claim_inbound_decisions_basis_check" CHECK (("claim_inbound_upload_decisions"."classification" = 'intended-for-member' and "claim_inbound_upload_decisions"."role_basis" = 'staff')
        or ("claim_inbound_upload_decisions"."classification" = 'approved-to-show' and "claim_inbound_upload_decisions"."role_basis" = 'tenant_admin')),
	CONSTRAINT "claim_inbound_decisions_file_check" CHECK ("claim_inbound_upload_decisions"."file_size" between 1 and 1048576 and "claim_inbound_upload_decisions"."mime_type" = 'application/pdf'
        and "claim_inbound_upload_decisions"."sha256" ~ '^[a-f0-9]{64}$' and "claim_inbound_upload_decisions"."file_name" ~ '\S'
        and "claim_inbound_upload_decisions"."office_receipt_ref" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
	CONSTRAINT "claim_inbound_decisions_key_check" CHECK ("claim_inbound_upload_decisions"."document_id" ~ '^wp12-inbound-[a-f0-9]{32}$'
        and "claim_inbound_upload_decisions"."file_path" = 'pii/tenants/' || "claim_inbound_upload_decisions"."tenant_id" || '/claims/' || "claim_inbound_upload_decisions"."claim_id" || '/' || "claim_inbound_upload_decisions"."document_id" || '.pdf')
);
--> statement-breakpoint
ALTER TABLE "claim_inbound_upload_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE public.claim_inbound_object_verifications (
  decision_id uuid PRIMARY KEY NOT NULL,
  verified_at timestamp (3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT claim_inbound_object_verifications_decision_fk FOREIGN KEY (decision_id)
    REFERENCES public.claim_inbound_upload_decisions (id)
);
--> statement-breakpoint
ALTER TABLE public.claim_inbound_object_verifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.claim_inbound_object_verifications FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "claim_correspondence_received_documents" ADD CONSTRAINT "claim_received_documents_entry_fk" FOREIGN KEY ("tenant_id","claim_id","correspondence_id") REFERENCES "public"."claim_correspondence"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_correspondence_received_documents" ADD CONSTRAINT "claim_received_documents_document_fk" FOREIGN KEY ("tenant_id","claim_id","claim_document_id") REFERENCES "public"."claim_documents"("tenant_id","claim_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "claim_correspondence_received_seals" ADD CONSTRAINT "claim_received_seals_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_inbound_pilot_cases" ADD CONSTRAINT "claim_inbound_pilot_cases_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_inbound_upload_decisions" ADD CONSTRAINT "claim_inbound_decisions_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_inbound_upload_decisions" ADD CONSTRAINT "claim_inbound_decisions_actor_fk" FOREIGN KEY ("tenant_id","decided_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_received_documents_entry_document_uq" ON "claim_correspondence_received_documents" USING btree ("correspondence_id","claim_document_id");--> statement-breakpoint
CREATE INDEX "claim_received_documents_case_idx" ON "claim_correspondence_received_documents" USING btree ("tenant_id","claim_id","correspondence_id");--> statement-breakpoint
CREATE INDEX "claim_received_documents_document_idx" ON "claim_correspondence_received_documents" USING btree ("tenant_id","claim_id","claim_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_inbound_decisions_correlation_uq" ON "claim_inbound_upload_decisions" USING btree ("tenant_id","correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_inbound_decisions_document_uq" ON "claim_inbound_upload_decisions" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_inbound_decisions_object_uq" ON "claim_inbound_upload_decisions" USING btree ("bucket","file_path");--> statement-breakpoint
CREATE INDEX "claim_inbound_decisions_case_idx" ON "claim_inbound_upload_decisions" USING btree ("tenant_id","claim_id");--> statement-breakpoint
CREATE POLICY "claim_received_documents_tenant" ON "claim_correspondence_received_documents" AS PERMISSIVE FOR ALL TO public USING ("claim_correspondence_received_documents"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence_received_documents"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_correspondence_received_documents"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence_received_documents"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "claim_received_seals_tenant" ON "claim_correspondence_received_seals" AS PERMISSIVE FOR ALL TO public USING ("claim_correspondence_received_seals"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence_received_seals"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_correspondence_received_seals"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_correspondence_received_seals"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "claim_inbound_pilot_cases_read" ON "claim_inbound_pilot_cases" AS PERMISSIVE FOR SELECT TO public USING ("claim_inbound_pilot_cases"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        or exists (select 1 from "claim" c where c.tenant_id = "claim_inbound_pilot_cases"."tenant_id" and c.id = "claim_inbound_pilot_cases"."claim_id"
          and coalesce(c.access_tenant_id, c.tenant_id) = (select current_setting('app.current_access_tenant_id', true))::text));--> statement-breakpoint
CREATE POLICY "claim_inbound_decisions_tenant" ON "claim_inbound_upload_decisions" AS PERMISSIVE FOR ALL TO public USING ("claim_inbound_upload_decisions"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_inbound_upload_decisions"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_inbound_upload_decisions"."tenant_id" = (select current_setting('app.current_tenant_id', true))::text
        and "claim_inbound_upload_decisions"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);

--> statement-breakpoint
-- Classify the URL path's final segment without rewriting the stored reference.
CREATE FUNCTION public.claim_inbound_reserved_path(p_path text) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  reserved_basename constant text := '(^|/)wp12-inbound-[a-f0-9]{32}[.]pdf';
  object_key text;
  encoded_octet text[];
  byte integer;
BEGIN
  object_key := split_part(split_part(translate(p_path, E'\t\r\n', ''), '#', 1), '?', 1);
  object_key := regexp_replace(replace(object_key, E'\\', '/') COLLATE "C", '[[:cntrl:] ]+$', '');
  IF object_key COLLATE "C" ~ (reserved_basename || '$') THEN RETURN true; END IF;
  IF strpos(object_key, '%') = 0 THEN RETURN false; END IF;

  object_key := regexp_replace(object_key, '%(?:25)+([0-9a-f]{2})', E'%\\1', 'gi');
  FOR encoded_octet IN SELECT DISTINCT regexp_matches(object_key, '%([0-9a-fA-F]{2})', 'g') LOOP
    byte := get_byte(decode(encoded_octet[1], 'hex'), 0);
    IF byte BETWEEN 1 AND 127 AND byte <> 37 THEN
      object_key := replace(object_key, '%' || encoded_octet[1], chr(byte));
    END IF;
  END LOOP;
  object_key := replace(translate(object_key, E'\t\r\n', ''), E'\\', '/');
  object_key := regexp_replace(object_key COLLATE "C", '[[:cntrl:] ]+$', '');
  -- Encoded delimiters may be decoded upstream. Keep any literal reserved path recognized above.
  RETURN object_key COLLATE "C" ~ (reserved_basename || '($|[?#])');
END;
$$;
--> statement-breakpoint
-- The reserved namespace is protected independently of the writer's snapshot, tenant or case.
LOCK TABLE public.claim_documents, public.documents IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.claim_documents
    WHERE id LIKE 'wp12-inbound-%' OR public.claim_inbound_reserved_path(file_path)
  ) OR EXISTS (
    SELECT 1 FROM public.documents
    WHERE id LIKE 'wp12-inbound-%' OR public.claim_inbound_reserved_path(storage_path)
  ) THEN
    RAISE EXCEPTION 'WP-12.1 document namespace is already occupied';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE public.claim_inbound_pilot_cases FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.claim_inbound_upload_decisions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.claim_correspondence_received_seals FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.claim_correspondence_received_documents FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.claim_correspondence_received_seals ADD CONSTRAINT claim_received_seals_entry_fk
  FOREIGN KEY (tenant_id, claim_id, correspondence_id)
  REFERENCES public.claim_correspondence (tenant_id, claim_id, id)
  DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DO $$
DECLARE
  capability_role name;
BEGIN
  FOREACH capability_role IN ARRAY ARRAY[
    'interdomestik_wp12_guard', 'interdomestik_wp12_receipt_writer', 'interdomestik_wp12_verifier'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = capability_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOBYPASSRLS', capability_role);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = capability_role
        AND (rolcanlogin OR rolinherit OR rolbypassrls OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication)
    ) THEN
      RAISE EXCEPTION 'WP-12.1 capability role % has unexpected authority', capability_role;
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA public TO interdomestik_wp12_guard;
--> statement-breakpoint
GRANT SELECT (tenant_id, claim_id, enrolled_at) ON public.claim_inbound_pilot_cases TO interdomestik_wp12_guard;
--> statement-breakpoint
GRANT SELECT (tenant_id, claim_id, document_id, bucket, file_path)
  ON public.claim_inbound_upload_decisions TO interdomestik_wp12_guard;
--> statement-breakpoint
GRANT SELECT (tenant_id, id, role, branch_id) ON public."user" TO interdomestik_wp12_guard;
--> statement-breakpoint
-- A row lock requires UPDATE privilege on one column. The guard holds actor row locks for writes.
GRANT UPDATE ("updatedAt") ON public."user" TO interdomestik_wp12_guard;
--> statement-breakpoint
GRANT SELECT (tenant_id, claim_id, id, bucket, file_path)
  ON public.claim_documents TO interdomestik_wp12_guard;
--> statement-breakpoint
-- The public enrollment policy checks the case's access tenant. The home guard also checks self-supply.
GRANT SELECT (tenant_id, id, access_tenant_id, branch_id, "userId") ON public.claim TO interdomestik_wp12_guard;
--> statement-breakpoint
CREATE POLICY claim_inbound_pilot_cases_guard ON public.claim_inbound_pilot_cases
  FOR SELECT TO interdomestik_wp12_guard USING (true);
--> statement-breakpoint
CREATE POLICY claim_inbound_decisions_guard ON public.claim_inbound_upload_decisions
  FOR SELECT TO interdomestik_wp12_guard USING (true);
--> statement-breakpoint
CREATE POLICY claim_documents_inbound_guard_read ON public.claim_documents
  FOR SELECT TO interdomestik_wp12_guard USING (id LIKE 'wp12-inbound-%');
--> statement-breakpoint
-- Only the guard can lock an RLS-hidden parent. UPDATE privilege is required for a row lock,
-- and the restrictive policy prevents this role from using that privilege to change rows.
GRANT UPDATE (id) ON public.claim TO interdomestik_wp12_guard;
--> statement-breakpoint
CREATE POLICY claim_inbound_guard_case_read ON public.claim
  FOR SELECT TO interdomestik_wp12_guard USING (true);
--> statement-breakpoint
CREATE POLICY claim_inbound_guard_case_lock ON public.claim
  FOR UPDATE TO interdomestik_wp12_guard USING (true) WITH CHECK (false);
--> statement-breakpoint
CREATE POLICY claim_inbound_guard_case_no_update ON public.claim
  AS RESTRICTIVE FOR UPDATE TO interdomestik_wp12_guard USING (true) WITH CHECK (false);
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_staff_branch_allowed(p_tenant text, p_branch text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
  SELECT p_tenant = current_setting('app.current_tenant_id', true)
    AND p_tenant = current_setting('app.current_access_tenant_id', true)
    AND current_setting('app.current_actor_role', true) = 'staff'
    AND (nullif(current_setting('app.current_actor_branch_id', true), '') IS NULL
      OR p_branch IS NOT DISTINCT FROM current_setting('app.current_actor_branch_id', true))
    AND EXISTS (
      SELECT 1 FROM public."user" AS staff
      WHERE staff.tenant_id = p_tenant AND staff.id = current_setting('app.current_actor_id', true)
        AND staff.role = 'staff' AND (staff.branch_id IS NULL OR staff.branch_id IS NOT DISTINCT FROM p_branch)
    );
$$;
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_lock_staff_branch(p_tenant text, p_branch text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  session_branch text := nullif(current_setting('app.current_actor_branch_id', true), '');
BEGIN
  IF p_tenant IS DISTINCT FROM current_setting('app.current_tenant_id', true)
    OR p_tenant IS DISTINCT FROM current_setting('app.current_access_tenant_id', true)
    OR current_setting('app.current_actor_role', true) IS DISTINCT FROM 'staff'
    OR (session_branch IS NOT NULL AND session_branch IS DISTINCT FROM p_branch) THEN
    RETURN false;
  END IF;

  PERFORM staff.id FROM public."user" AS staff
    WHERE staff.tenant_id = p_tenant AND staff.id = current_setting('app.current_actor_id', true)
      AND staff.role = 'staff' AND (staff.branch_id IS NULL OR staff.branch_id IS NOT DISTINCT FROM p_branch)
    FOR SHARE OF staff;
  RETURN FOUND;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_decision_visible(
  p_tenant text, p_case text, p_decider text, p_uploader text, p_recipient text,
  p_document text, p_bucket varchar, p_path varchar
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  -- Return before the principal query is planned and its column grants are checked.
  IF CURRENT_USER = 'interdomestik_wp12_guard' THEN RETURN true; END IF;
  IF CURRENT_USER = 'interdomestik_wp12_receipt_writer' THEN
    RETURN current_setting('app.current_actor_role', true) = 'staff'
      AND p_uploader = current_setting('app.current_actor_id', true);
  END IF;
  IF current_setting('app.current_actor_role', true) = 'tenant_admin' THEN
    RETURN p_decider = current_setting('app.current_actor_id', true);
  END IF;
  IF current_setting('app.current_actor_role', true) = 'staff' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.claim AS c
      WHERE c.tenant_id = p_tenant AND c.id = p_case
        AND c."staffId" = current_setting('app.current_actor_id', true)
        AND c.case_lifecycle_state <> 'draft'
        AND public.claim_inbound_staff_branch_allowed(c.tenant_id, c.branch_id)
        AND ((p_uploader = c."staffId" AND p_recipient = c."userId") OR EXISTS (
          SELECT 1 FROM public.claim_documents AS d
          WHERE d.tenant_id = p_tenant AND d.claim_id = p_case AND d.id = p_document
            AND d.bucket = p_bucket AND d.file_path = p_path
        ))
    );
  END IF;
  RETURN false;
END;
$$;
--> statement-breakpoint
CREATE POLICY claim_inbound_decisions_principal ON public.claim_inbound_upload_decisions
  AS RESTRICTIVE FOR SELECT TO public USING (
    public.claim_inbound_decision_visible(tenant_id, claim_id, decided_by, uploader_id,
      recipient_id, document_id, bucket, file_path)
  );
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_decision_deadline(p_decided_at timestamptz) RETURNS timestamptz
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
  SELECT p_decided_at + interval '15 minutes';
$$;
--> statement-breakpoint
CREATE POLICY claim_inbound_object_verifications_read ON public.claim_inbound_object_verifications
  FOR SELECT TO public USING (EXISTS (
    SELECT 1 FROM public.claim_inbound_upload_decisions AS d
    WHERE d.id = claim_inbound_object_verifications.decision_id
  ));
--> statement-breakpoint
-- The receipt owner remains subject to decision RLS. Only the fixed verifier command can use it.
GRANT USAGE, CREATE ON SCHEMA public TO interdomestik_wp12_receipt_writer;
--> statement-breakpoint
GRANT SELECT (id, tenant_id, claim_id, uploader_id, recipient_id,
  bucket, file_path, decided_at, file_size, sha256)
  ON public.claim_inbound_upload_decisions TO interdomestik_wp12_receipt_writer;
--> statement-breakpoint
GRANT SELECT (tenant_id, id, access_tenant_id, branch_id, case_lifecycle_state, "staffId", "userId"),
  UPDATE (id) ON public.claim TO interdomestik_wp12_receipt_writer;
--> statement-breakpoint
CREATE POLICY claim_inbound_receipt_writer_no_case_update ON public.claim
  AS RESTRICTIVE FOR UPDATE TO interdomestik_wp12_receipt_writer USING (true) WITH CHECK (false);
--> statement-breakpoint
GRANT SELECT (tenant_id, claim_id, enrolled_at, paused) ON public.claim_inbound_pilot_cases
  TO interdomestik_wp12_receipt_writer;
--> statement-breakpoint
GRANT INSERT (decision_id) ON public.claim_inbound_object_verifications TO interdomestik_wp12_receipt_writer;
--> statement-breakpoint
CREATE POLICY claim_inbound_object_verifications_record ON public.claim_inbound_object_verifications
  FOR INSERT TO interdomestik_wp12_receipt_writer WITH CHECK (EXISTS (
    SELECT 1 FROM public.claim_inbound_upload_decisions AS d
    WHERE d.id = claim_inbound_object_verifications.decision_id
  ));
--> statement-breakpoint
CREATE FUNCTION public.record_claim_inbound_object_verification(
  p_decision_id uuid, p_bucket text, p_path text, p_file_size integer, p_sha256 text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET row_security = on AS $$
DECLARE
  tenant text := nullif(current_setting('app.current_tenant_id', true), '');
  actor text := nullif(current_setting('app.current_actor_id', true), '');
  approved_case text;
  approved_at timestamptz;
  case_branch text;
BEGIN
  IF tenant IS NULL OR tenant IS DISTINCT FROM current_setting('app.current_access_tenant_id', true)
    OR actor IS NULL OR current_setting('app.current_actor_role', true) IS DISTINCT FROM 'staff' THEN
    RETURN false;
  END IF;

  SELECT d.claim_id, d.decided_at, c.branch_id INTO approved_case, approved_at, case_branch
  FROM public.claim_inbound_upload_decisions AS d
  JOIN public.claim AS c ON c.tenant_id = d.tenant_id AND c.id = d.claim_id
  WHERE d.tenant_id = tenant AND d.id = p_decision_id AND d.uploader_id = actor
    AND d.bucket = p_bucket AND d.file_path = p_path AND d.file_size = p_file_size AND d.sha256 = p_sha256
    AND coalesce(c.access_tenant_id, c.tenant_id) = tenant AND c.case_lifecycle_state <> 'draft'
    AND c."staffId" = actor AND c."userId" = d.recipient_id
  FOR SHARE OF c;

  IF NOT FOUND OR public.claim_inbound_lock_staff_branch(tenant, case_branch) IS NOT TRUE
    OR NOT EXISTS (
      SELECT 1 FROM public.claim_inbound_pilot_cases AS e
      WHERE e.tenant_id = tenant AND e.claim_id = approved_case AND e.enrolled_at IS NOT NULL AND NOT e.paused
    )
    OR public.claim_inbound_decision_deadline(approved_at) <= clock_timestamp() THEN
    RETURN false;
  END IF;
  INSERT INTO public.claim_inbound_object_verifications (decision_id) VALUES (p_decision_id)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON public.claim_inbound_object_verifications FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
  api_role name;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON public.claim_inbound_object_verifications FROM %I', api_role);
  END LOOP;
END;
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO interdomestik_wp12_verifier;
--> statement-breakpoint
-- The direct pool uses the database admin login. Require an explicit SET ROLE for attestation.
DO $$
BEGIN
  IF pg_catalog.current_setting('server_version_num')::integer >= 160000 THEN
    EXECUTE 'GRANT interdomestik_wp12_verifier TO CURRENT_USER WITH INHERIT FALSE, SET TRUE';
  ELSIF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER AND rolsuper) THEN
    -- PG15 stops inheritance at the intermediate NOINHERIT role but permits SET ROLE through it.
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'interdomestik_wp12_verifier_pg15') THEN
      CREATE ROLE interdomestik_wp12_verifier_pg15 NOLOGIN NOINHERIT NOBYPASSRLS;
      GRANT interdomestik_wp12_verifier TO interdomestik_wp12_verifier_pg15;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'interdomestik_wp12_verifier_pg15'
        AND NOT (rolcanlogin OR rolinherit OR rolbypassrls OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication)
        AND pg_catalog.pg_has_role(oid, 'interdomestik_wp12_verifier', 'MEMBER')
    ) THEN
      RAISE EXCEPTION 'WP-12.1 PG15 verifier membership role has unexpected authority';
    END IF;
    GRANT interdomestik_wp12_verifier_pg15 TO CURRENT_USER;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_enrollment_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id, NEW.claim_id) IS DISTINCT FROM (OLD.tenant_id, OLD.claim_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot enrollment cannot move cases';
  END IF;

  -- Force old repeatable-read snapshots to conflict on the parent even if they see no enrollment.
  UPDATE public.claim AS c SET "userId" = c."userId"
  WHERE c.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.claim_id ELSE NEW.claim_id END
    AND c.tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot enrollment requires a writable case';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_enrollment_guard AFTER INSERT OR UPDATE OR DELETE ON public.claim_inbound_pilot_cases
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_enrollment_guard_fn();
--> statement-breakpoint
-- This is a trigger-only check; no runtime role can call it to discover enrollment.
CREATE FUNCTION public.claim_inbound_document_home_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  home_tenant text;
  ordinary_document constant boolean := NEW.id NOT LIKE 'wp12-inbound-%'
    AND NOT public.claim_inbound_reserved_path(NEW.file_path);
  actor text := nullif(current_setting('app.current_actor_id', true), '');
  actor_role text := nullif(current_setting('app.current_actor_role', true), '');
  access_tenant text := current_setting('app.current_access_tenant_id', true);
BEGIN
  -- Ordinary keys must take the lock even when the snapshot predates the enrollment row.
  -- The reserved publication path obtains its own update lock before it can succeed.
  IF ordinary_document THEN
    PERFORM c.id FROM public.claim AS c WHERE c.id = NEW.claim_id FOR SHARE;
  END IF;
  SELECT e.tenant_id INTO home_tenant
    FROM public.claim_inbound_pilot_cases AS e WHERE e.claim_id = NEW.claim_id AND e.enrolled_at IS NOT NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF home_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot case document refused';
  END IF;
  IF ordinary_document AND (
    actor_role IS NULL OR actor_role NOT IN ('member', 'user', 'agent')
    OR NEW.uploaded_by IS DISTINCT FROM actor
    OR home_tenant IS DISTINCT FROM access_tenant
    OR NOT EXISTS (
      SELECT 1 FROM public.claim AS c
      WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id
        AND coalesce(c.access_tenant_id, c.tenant_id) = access_tenant AND c."userId" = actor
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot case document refused';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_document_home_guard AFTER INSERT ON public.claim_documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_document_home_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_decision_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  recipient text;
  uploader text;
BEGIN
  SELECT c."userId", c."staffId" INTO recipient, uploader FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id
      AND c.case_lifecycle_state <> 'draft'
      AND (NEW.role_basis <> 'staff' OR public.claim_inbound_staff_branch_allowed(c.tenant_id, c.branch_id))
    FOR UPDATE OF c;
  IF NOT FOUND OR recipient IS NULL OR uploader IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.claim_inbound_pilot_cases AS e
      WHERE e.tenant_id = NEW.tenant_id AND e.claim_id = NEW.claim_id
        AND e.enrolled_at IS NOT NULL AND NOT e.paused
    )
    OR NEW.recipient_id IS DISTINCT FROM recipient OR NEW.uploader_id IS DISTINCT FROM uploader
    OR NEW.decided_by IS DISTINCT FROM current_setting('app.current_actor_id', true)
    OR NEW.role_basis IS DISTINCT FROM current_setting('app.current_actor_role', true)
    OR NEW.tenant_id COLLATE "C" !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
    OR NEW.claim_id COLLATE "C" !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
    OR strpos(NEW.tenant_id, '..') > 0 OR strpos(NEW.claim_id, '..') > 0
    OR (NEW.role_basis = 'staff' AND NEW.decided_by IS DISTINCT FROM uploader) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot visibility decision refused';
  END IF;
  NEW.decided_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_decision_guard BEFORE INSERT ON public.claim_inbound_upload_decisions
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_decision_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_document_publication_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  approval public.claim_inbound_upload_decisions%ROWTYPE;
  recipient text;
  uploader text;
  actor text := nullif(current_setting('app.current_actor_id', true), '');
  actor_role text := nullif(current_setting('app.current_actor_role', true), '');
BEGIN
  -- The home guard handles ordinary documents without requiring the writer to read enrollment.
  IF NEW.id NOT LIKE 'wp12-inbound-%' AND NOT public.claim_inbound_reserved_path(NEW.file_path) THEN
    RETURN NULL;
  END IF;

  SELECT c."userId", c."staffId" INTO recipient, uploader FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id
      AND c.case_lifecycle_state <> 'draft'
      AND public.claim_inbound_staff_branch_allowed(c.tenant_id, c.branch_id)
    FOR UPDATE OF c;
  IF NOT FOUND OR actor_role IS DISTINCT FROM 'staff' OR actor IS DISTINCT FROM uploader THEN
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document is outside assigned staff scope';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.claim_inbound_pilot_cases AS e
    WHERE e.tenant_id = NEW.tenant_id AND e.claim_id = NEW.claim_id
      AND e.enrolled_at IS NOT NULL AND NOT e.paused
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document requires active enrollment';
  END IF;

  SELECT d.* INTO approval FROM public.claim_inbound_upload_decisions AS d
    WHERE d.document_id = NEW.id AND d.bucket = NEW.bucket AND d.file_path = NEW.file_path
      AND d.tenant_id = NEW.tenant_id AND d.claim_id = NEW.claim_id;
  IF NOT FOUND OR actor IS DISTINCT FROM approval.uploader_id
    OR NEW.uploaded_by IS DISTINCT FROM approval.uploader_id OR NEW.category IS DISTINCT FROM 'evidence'
    OR coalesce(NEW.access_tenant_id, NEW.tenant_id) IS DISTINCT FROM NEW.tenant_id
    OR NEW.name IS DISTINCT FROM approval.file_name OR NEW.file_type IS DISTINCT FROM approval.mime_type
    OR NEW.file_size IS DISTINCT FROM approval.file_size THEN
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document refused';
  END IF;

  IF public.claim_inbound_decision_deadline(approval.decided_at) <= clock_timestamp()
    OR recipient IS DISTINCT FROM approval.recipient_id
    OR uploader IS DISTINCT FROM approval.uploader_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document refused';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.claim_inbound_object_verifications AS v WHERE v.decision_id = approval.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document requires verified storage';
  END IF;

  -- Advance the row version so a waiting owner update with an old snapshot must conflict.
  UPDATE public.claim SET "userId" = recipient WHERE tenant_id = NEW.tenant_id AND id = NEW.claim_id;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_document_publication_guard AFTER INSERT ON public.claim_documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_document_publication_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_staff_scope_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  case_branch text;
BEGIN
  -- The preceding guards hold the case lock. Hold the actor's staff row through commit too.
  SELECT c.branch_id INTO case_branch FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id;
  IF NOT FOUND OR public.claim_inbound_lock_staff_branch(NEW.tenant_id, case_branch) IS NOT TRUE THEN
    IF TG_TABLE_NAME = 'claim_inbound_upload_decisions' THEN
      RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot visibility decision refused';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document is outside assigned staff scope';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_staff_scope_guard AFTER INSERT ON public.claim_inbound_upload_decisions
  FOR EACH ROW WHEN (NEW.role_basis = 'staff') EXECUTE FUNCTION public.claim_inbound_staff_scope_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_admin_decision_scope_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.tenant_id IS NOT DISTINCT FROM current_setting('app.current_tenant_id', true)
    AND NEW.tenant_id IS NOT DISTINCT FROM current_setting('app.current_access_tenant_id', true)
    AND NEW.decided_by IS NOT DISTINCT FROM current_setting('app.current_actor_id', true)
    AND current_setting('app.current_actor_role', true) = 'tenant_admin' THEN
    PERFORM administrator.id FROM public."user" AS administrator
      WHERE administrator.tenant_id = NEW.tenant_id AND administrator.id = NEW.decided_by
        AND administrator.role = 'tenant_admin'
      FOR SHARE OF administrator;
    IF FOUND THEN RETURN NULL; END IF;
  END IF;
  RAISE EXCEPTION USING ERRCODE = 'P1210', MESSAGE = 'Pilot visibility decision refused';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_admin_decision_scope_guard AFTER INSERT ON public.claim_inbound_upload_decisions
  FOR EACH ROW WHEN (NEW.role_basis = 'tenant_admin')
  EXECUTE FUNCTION public.claim_inbound_admin_decision_scope_guard_fn();
--> statement-breakpoint
CREATE TRIGGER claim_inbound_staff_scope_guard AFTER INSERT ON public.claim_documents
  FOR EACH ROW WHEN (NEW.id LIKE 'wp12-inbound-%' OR public.claim_inbound_reserved_path(NEW.file_path))
  EXECUTE FUNCTION public.claim_inbound_staff_scope_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_document_scope_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id LIKE 'wp12-inbound-%' OR public.claim_inbound_reserved_path(NEW.file_path) THEN
    IF NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
      OR NEW.access_tenant_id IS DISTINCT FROM OLD.access_tenant_id
      OR NEW.category IS DISTINCT FROM OLD.category THEN
      RAISE EXCEPTION USING ERRCODE = 'P1212', MESSAGE = 'Pilot document read scope cannot change';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_document_scope_guard AFTER UPDATE ON public.claim_documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_document_scope_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_polymorphic_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW.id LIKE 'wp12-inbound-%' OR public.claim_inbound_reserved_path(NEW.storage_path) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1211', MESSAGE = 'Reserved pilot document refused';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_polymorphic_guard AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_polymorphic_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_inbound_owner_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NEW."userId" IS DISTINCT FROM OLD."userId" AND EXISTS (
    SELECT 1 FROM public.claim_inbound_upload_decisions AS a
    JOIN public.claim_documents AS d ON d.tenant_id = a.tenant_id AND d.claim_id = a.claim_id
      AND d.id = a.document_id AND d.bucket = a.bucket AND d.file_path = a.file_path
    WHERE a.tenant_id = OLD.tenant_id AND a.claim_id = OLD.id
      AND d.id LIKE 'wp12-inbound-%'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1213', MESSAGE = 'A published pilot document binds the case owner';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_inbound_owner_guard AFTER UPDATE ON public.claim
  FOR EACH ROW EXECUTE FUNCTION public.claim_inbound_owner_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_received_seal_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.claim WHERE tenant_id = NEW.tenant_id AND id = NEW.claim_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.claim_inbound_pilot_cases AS e
    WHERE e.tenant_id = NEW.tenant_id AND e.claim_id = NEW.claim_id AND e.enrolled_at IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.claim_correspondence WHERE id = NEW.correspondence_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1205', MESSAGE = 'Received set must precede the inbound record';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_received_seal_guard BEFORE INSERT ON public.claim_correspondence_received_seals
  FOR EACH ROW EXECUTE FUNCTION public.claim_received_seal_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_received_document_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM c.id FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
      SELECT 1 FROM public.claim_inbound_pilot_cases AS e
      WHERE e.tenant_id = NEW.tenant_id AND e.claim_id = NEW.claim_id
        AND e.enrolled_at IS NOT NULL AND NOT e.paused
    ) OR NOT EXISTS (
    SELECT 1 FROM public.claim_inbound_upload_decisions AS a
    JOIN public.claim_documents AS d ON d.tenant_id = a.tenant_id AND d.claim_id = a.claim_id
      AND d.id = a.document_id AND d.bucket = a.bucket AND d.file_path = a.file_path
    JOIN public.claim_correspondence AS c ON c.tenant_id = d.tenant_id AND c.claim_id = d.claim_id
    JOIN public.claim AS k ON k.tenant_id = c.tenant_id AND k.id = c.claim_id
    WHERE d.tenant_id = NEW.tenant_id AND d.claim_id = NEW.claim_id
      AND d.id = NEW.claim_document_id AND c.id = NEW.correspondence_id
      AND c.direction = 'inbound' AND c.recorded_by_staff_id = k."staffId"
      AND c.recorded_by_staff_id = current_setting('app.current_actor_id', true)
      AND current_setting('app.current_actor_role', true) = 'staff'
      AND public.claim_document_provenance_ok(d.tenant_id, d.claim_id, d.id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1203', MESSAGE = 'An inbound link requires approved case evidence';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_received_document_guard BEFORE INSERT ON public.claim_correspondence_received_documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_received_document_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_received_document_actor_scope_guard_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  case_branch text;
BEGIN
  -- The preceding guard holds the case lock before the actor row is locked.
  SELECT c.branch_id INTO case_branch FROM public.claim AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.claim_id;
  IF NOT FOUND OR public.claim_inbound_lock_staff_branch(NEW.tenant_id, case_branch) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P1203', MESSAGE = 'An inbound link requires approved case evidence';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER claim_received_document_actor_scope_guard AFTER INSERT ON public.claim_correspondence_received_documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_received_document_actor_scope_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.claim_received_set_count_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.claim_correspondence_received_seals AS s
    JOIN public.claim_correspondence AS c ON c.tenant_id = s.tenant_id AND c.claim_id = s.claim_id
      AND c.id = s.correspondence_id
    WHERE s.tenant_id = NEW.tenant_id AND s.claim_id = NEW.claim_id
      AND s.correspondence_id = NEW.correspondence_id AND c.direction = 'inbound'
      AND s.document_count = (
        SELECT count(*) FROM public.claim_correspondence_received_documents AS d
        WHERE d.tenant_id = s.tenant_id AND d.claim_id = s.claim_id
          AND d.correspondence_id = s.correspondence_id
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P1204', MESSAGE = 'Received set does not match its seal';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_received_seal_count AFTER INSERT ON public.claim_correspondence_received_seals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.claim_received_set_count_fn();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER claim_received_document_count AFTER INSERT ON public.claim_correspondence_received_documents
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.claim_received_set_count_fn();
--> statement-breakpoint
CREATE TRIGGER claim_inbound_decisions_immutable BEFORE UPDATE OR DELETE ON public.claim_inbound_upload_decisions
  FOR EACH ROW EXECUTE FUNCTION public.claim_register_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER claim_received_seals_immutable BEFORE UPDATE OR DELETE ON public.claim_correspondence_received_seals
  FOR EACH ROW EXECUTE FUNCTION public.claim_register_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER claim_received_documents_immutable BEFORE UPDATE OR DELETE ON public.claim_correspondence_received_documents
  FOR EACH ROW EXECUTE FUNCTION public.claim_register_reject_mutation_fn();
--> statement-breakpoint
-- Trigger bindings use the creator's EXECUTE privilege. The function owner retains its privilege.
-- Remove PUBLIC and any installation-specific default grants before granting caller access.
DO $$
DECLARE
  inbound_function regprocedure;
  grantee name;
BEGIN
  FOREACH inbound_function IN ARRAY ARRAY[
    'public.claim_inbound_reserved_path(text)',
    'public.claim_inbound_staff_branch_allowed(text, text)',
    'public.claim_inbound_lock_staff_branch(text, text)',
    'public.claim_inbound_decision_visible(text, text, text, text, text, text, varchar, varchar)',
    'public.claim_inbound_decision_deadline(timestamptz)',
    'public.record_claim_inbound_object_verification(uuid, text, text, integer, text)',
    'public.claim_inbound_enrollment_guard_fn()',
    'public.claim_inbound_document_home_guard_fn()',
    'public.claim_inbound_admin_decision_scope_guard_fn()',
    'public.claim_inbound_decision_guard_fn()',
    'public.claim_inbound_document_publication_guard_fn()',
    'public.claim_inbound_staff_scope_guard_fn()',
    'public.claim_inbound_document_scope_guard_fn()',
    'public.claim_inbound_polymorphic_guard_fn()',
    'public.claim_inbound_owner_guard_fn()',
    'public.claim_received_seal_guard_fn()',
    'public.claim_received_document_actor_scope_guard_fn()',
    'public.claim_received_document_guard_fn()',
    'public.claim_received_set_count_fn()'
  ]::regprocedure[] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', inbound_function);
    FOR grantee IN
      SELECT r.rolname FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) AS acl
      JOIN pg_catalog.pg_roles AS r ON r.oid = acl.grantee
      WHERE p.oid = inbound_function AND acl.grantee <> p.proowner
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', inbound_function, grantee);
    END LOOP;
  END LOOP;
END;
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_inbound_reserved_path(text),
  public.claim_inbound_decision_visible(text, text, text, text, text, text, varchar, varchar)
  TO interdomestik_wp12_guard;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.claim_inbound_lock_staff_branch(text, text),
  public.claim_inbound_decision_visible(text, text, text, text, text, text, varchar, varchar),
  public.claim_inbound_decision_deadline(timestamptz)
  TO interdomestik_wp12_receipt_writer;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.record_claim_inbound_object_verification(uuid, text, text, integer, text)
  TO interdomestik_wp12_verifier;
--> statement-breakpoint
REVOKE ALL ON public.claim_inbound_pilot_cases, public.claim_inbound_upload_decisions,
  public.claim_correspondence_received_seals, public.claim_correspondence_received_documents FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    -- Invoker helpers run in the runtime's row policies, write guards and upload expiry query.
    -- The branch check reads the live user row through the runtime's existing tenant RLS.
    GRANT EXECUTE ON FUNCTION public.claim_inbound_reserved_path(text),
      public.claim_inbound_staff_branch_allowed(text, text),
      public.claim_inbound_decision_visible(text, text, text, text, text, text, varchar, varchar),
      public.claim_inbound_decision_deadline(timestamptz)
      TO interdomestik_runtime_rls;
    REVOKE ALL ON public.claim_inbound_object_verifications FROM interdomestik_runtime_rls;
    GRANT SELECT ON public.claim_inbound_object_verifications TO interdomestik_runtime_rls;
    REVOKE ALL ON public.claim_inbound_pilot_cases, public.claim_inbound_upload_decisions,
      public.claim_correspondence_received_seals, public.claim_correspondence_received_documents
      FROM interdomestik_runtime_rls;
    GRANT SELECT ON public.claim_inbound_pilot_cases, public.claim_inbound_upload_decisions,
      public.claim_correspondence_received_seals, public.claim_correspondence_received_documents
      TO interdomestik_runtime_rls;
    GRANT INSERT (tenant_id, claim_id, correlation_id, classification, decided_by, role_basis,
      recipient_id, uploader_id, office_receipt_ref, document_id, bucket, file_path, file_name, mime_type, file_size, sha256)
      ON public.claim_inbound_upload_decisions TO interdomestik_runtime_rls;
    GRANT INSERT (tenant_id, claim_id, correspondence_id, document_count)
      ON public.claim_correspondence_received_seals TO interdomestik_runtime_rls;
    GRANT INSERT (tenant_id, claim_id, correspondence_id, claim_document_id)
      ON public.claim_correspondence_received_documents TO interdomestik_runtime_rls;
  END IF;
END;
$$;
--> statement-breakpoint
-- A CREATEROLE migrator can temporarily grant SET ROLE access for the owner transfer.
-- Keep any existing access. PG15 checks SET ROLE through ordinary membership.
DO $$
DECLARE
  set_privilege constant text := CASE WHEN pg_catalog.current_setting('server_version_num')::integer >= 160000
    THEN 'SET' ELSE 'MEMBER' END;
  grant_options constant text := CASE WHEN set_privilege = 'SET' THEN ' WITH INHERIT FALSE, SET TRUE' ELSE '' END;
  guard_set boolean := pg_catalog.pg_has_role(CURRENT_USER, 'interdomestik_wp12_guard', set_privilege);
  receipt_writer_set boolean := pg_catalog.pg_has_role(CURRENT_USER, 'interdomestik_wp12_receipt_writer', set_privilege);
BEGIN
  IF NOT guard_set THEN
    EXECUTE 'GRANT interdomestik_wp12_guard TO CURRENT_USER' || grant_options;
  END IF;
  IF NOT receipt_writer_set THEN
    EXECUTE 'GRANT interdomestik_wp12_receipt_writer TO CURRENT_USER' || grant_options;
  END IF;

  ALTER FUNCTION public.claim_inbound_lock_staff_branch(text, text) OWNER TO interdomestik_wp12_guard;
  ALTER FUNCTION public.claim_inbound_document_home_guard_fn() OWNER TO interdomestik_wp12_guard;
  ALTER FUNCTION public.claim_inbound_admin_decision_scope_guard_fn() OWNER TO interdomestik_wp12_guard;
  ALTER FUNCTION public.claim_inbound_staff_scope_guard_fn() OWNER TO interdomestik_wp12_guard;
  ALTER FUNCTION public.claim_inbound_owner_guard_fn() OWNER TO interdomestik_wp12_guard;
  ALTER FUNCTION public.claim_received_document_actor_scope_guard_fn() OWNER TO interdomestik_wp12_guard;
  ALTER FUNCTION public.record_claim_inbound_object_verification(uuid, text, text, integer, text)
    OWNER TO interdomestik_wp12_receipt_writer;

  IF NOT guard_set THEN
    REVOKE interdomestik_wp12_guard FROM CURRENT_USER GRANTED BY CURRENT_USER;
  END IF;
  IF NOT receipt_writer_set THEN
    REVOKE interdomestik_wp12_receipt_writer FROM CURRENT_USER GRANTED BY CURRENT_USER;
  END IF;
END;
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM interdomestik_wp12_guard, interdomestik_wp12_receipt_writer;
