CREATE TABLE "legal_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subject_user_id" text NOT NULL,
	"document_kind" text NOT NULL,
	"document_version" text NOT NULL,
	"locale" text NOT NULL,
	"text_sha256" text NOT NULL,
	"source_surface" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_acceptances_subject_version_uq" UNIQUE("tenant_id","subject_user_id","document_kind","document_version"),
	CONSTRAINT "legal_acceptances_source_check" CHECK ("legal_acceptances"."source_surface" = 'member_activation')
);
--> statement-breakpoint
ALTER TABLE "legal_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "legal_document_versions" (
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"locale" text NOT NULL,
	"text_sha256" text NOT NULL,
	"review_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legal_document_versions_digest_uq" UNIQUE("kind","version","locale","text_sha256"),
	CONSTRAINT "legal_document_versions_kind_check" CHECK ("legal_document_versions"."kind" in ('terms', 'privacy_notice')),
	CONSTRAINT "legal_document_versions_locale_check" CHECK ("legal_document_versions"."locale" in ('sq', 'en', 'sr', 'mk', 'de')),
	CONSTRAINT "legal_document_versions_digest_check" CHECK ("legal_document_versions"."text_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "legal_document_versions_review_status_check" CHECK ("legal_document_versions"."review_status" in ('legal_review_pending', 'approved'))
);
--> statement-breakpoint
ALTER TABLE "legal_document_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_subject_fk" FOREIGN KEY ("tenant_id","subject_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_text_fk" FOREIGN KEY ("document_kind","document_version","locale","text_sha256") REFERENCES "public"."legal_document_versions"("kind","version","locale","text_sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Quote the shared setting names into the static policy definitions.
DO $$
DECLARE
  actor_id_setting CONSTANT text := 'app.current_actor_id';
  actor_role_setting CONSTANT text := 'app.current_actor_role';
BEGIN
  EXECUTE format($policy$
    CREATE POLICY "legal_acceptances_select" ON "legal_acceptances" AS PERMISSIVE FOR SELECT TO public USING ("legal_acceptances"."tenant_id" = nullif(current_setting('app.current_access_tenant_id', true), '')
        and nullif(current_setting(%1$L, true), '') is not null
        and nullif(current_setting(%2$L, true), '') is not null
        and ("legal_acceptances"."subject_user_id" = current_setting(%1$L, true)
          or current_setting(%2$L, true) = 'tenant_admin'))
  $policy$, actor_id_setting, actor_role_setting);
  EXECUTE format($policy$
    CREATE POLICY "legal_acceptances_insert" ON "legal_acceptances" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("legal_acceptances"."tenant_id" = nullif(current_setting('app.current_access_tenant_id', true), '')
        and "legal_acceptances"."subject_user_id" = nullif(current_setting(%1$L, true), '')
        and current_setting(%2$L, true) in ('member', 'user'))
  $policy$, actor_id_setting, actor_role_setting);
END;
$$;
--> statement-breakpoint
CREATE POLICY "legal_document_versions_read" ON "legal_document_versions" AS PERMISSIVE FOR SELECT TO public USING (coalesce(current_setting('app.current_access_tenant_id', true), '') ~ '[^[:space:]]');--> statement-breakpoint
ALTER TABLE public.legal_document_versions
  ADD CONSTRAINT legal_document_versions_pkey PRIMARY KEY (kind, version, locale);
--> statement-breakpoint
ALTER TABLE public.legal_acceptances FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION public.legal_document_version_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = TG_RELID AND relowner = current_user::regrole::oid
  ) THEN
    RAISE check_violation USING MESSAGE = 'WP-13: only the migration owner can publish a legal version';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER legal_document_versions_insert_guard
BEFORE INSERT ON public.legal_document_versions
FOR EACH ROW EXECUTE FUNCTION public.legal_document_version_insert_guard();
--> statement-breakpoint
CREATE FUNCTION public.legal_acceptance_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.accepted_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER legal_acceptances_stamp
BEFORE INSERT ON public.legal_acceptances
FOR EACH ROW EXECUTE FUNCTION public.legal_acceptance_stamp();
--> statement-breakpoint
CREATE FUNCTION public.legal_acceptance_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  cleanup_role oid;
BEGIN
  IF TG_TABLE_NAME = 'legal_acceptances' AND TG_OP = 'DELETE' THEN
    SELECT oid INTO cleanup_role FROM pg_roles WHERE rolname = 'interdomestik_seed_cleanup';
    IF cleanup_role IS NOT NULL AND pg_has_role(current_user, cleanup_role, 'MEMBER') THEN
      RETURN NULL;
    END IF;
  END IF;
  RAISE check_violation USING MESSAGE = format('WP-13: %I is append-only', TG_TABLE_NAME);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER legal_document_versions_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.legal_document_versions
FOR EACH STATEMENT EXECUTE FUNCTION public.legal_acceptance_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER legal_acceptances_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.legal_acceptances
FOR EACH STATEMENT EXECUTE FUNCTION public.legal_acceptance_reject_mutation();
--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.legal_document_versions FROM PUBLIC;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.legal_acceptances FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.legal_document_versions
      FROM interdomestik_runtime_rls;
    GRANT SELECT ON public.legal_document_versions TO interdomestik_runtime_rls;
    REVOKE UPDATE, DELETE, TRUNCATE ON public.legal_acceptances FROM interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.legal_acceptances TO interdomestik_runtime_rls;
  END IF;
END;
$$;
--> statement-breakpoint
INSERT INTO public.legal_document_versions (kind, version, locale, text_sha256, review_status)
SELECT document.kind, 'v2026_11_pilot_draft_1', source.locale, document.text_sha256, 'legal_review_pending'
FROM (VALUES
  ('sq', '05799385a102a0aa2765cf7ba20d05b99e94b8e1826e9776ff9c2cd4635f4529', '2070f8eadd0dade5d41a096b7ef5fe9c9f83982b7b8fdf8eadb1512e82cdba8c'),
  ('en', '3f9bade073ca03021820bf66e1c92bb43d5ec0ab004fe7eb69a15182f49fce68', '0af5413567fcc5959dce9c7821d877c4a323454966428dfde290b62243cb6e58'),
  ('sr', '6e01904429d454bd5980ac86c83a150108cfac738a06b84af41c31cc0c2fadd6', 'b4c934cbdb798cee64c5a0a892ae749db70881bbb674f558801c28b8f7d23988'),
  ('mk', 'b60ffc5c5e397d35da9611504c2c6803dce3ebe269d407fe03acba9a7f6294a4', 'e82ef5d7497923d4e5f17c7a6eca7d0211e74b1bd011c7ffab5f21555f74d20c'),
  ('de', 'c021062dcb077bdb623783275850f5bce9eb6fd751946809868403eb3dacffff', 'fc0cebcbb6c8bf9fb2b3564f216b32ad8fc8ae6677496ec41a27b415c494c1d9')
) AS source(locale, terms_sha256, privacy_notice_sha256)
CROSS JOIN LATERAL (VALUES
  ('terms', source.terms_sha256),
  ('privacy_notice', source.privacy_notice_sha256)
) AS document(kind, text_sha256);
