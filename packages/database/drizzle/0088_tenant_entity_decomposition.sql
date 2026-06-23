-- T-504 additive entity-decomposition foundation.
-- Rollback/data-repair plan: tenants and existing tenant FKs remain intact; no
-- destructive tenant/member/status changes occur. If interrupted, rerun this
-- migration: INSERT ... ON CONFLICT repairs from tenants. To rollback behavior,
-- ignore tenant_entity_boundaries and subscriptions.legal_entity_id; physical
-- rollback after backup/code rollback is reverse order: view, subscription FK
-- and column, default_booking_links, marketing_hosts, legal_entities.

CREATE TABLE IF NOT EXISTS public."legal_entities" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL,
  "legal_name" text NOT NULL,
  "country_code" text NOT NULL,
  "governing_law" text,
  "terms_version" text,
  "currency" text DEFAULT 'EUR' NOT NULL,
  "tax_id" text,
  "address" jsonb,
  "contact" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "legal_entities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES public."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "legal_entities_country_code_check" CHECK ("country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "legal_entities_governing_law_check" CHECK ("governing_law" IS NULL OR "governing_law" ~ '^[A-Z]{2}$')
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public."marketing_hosts" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL,
  "label" text NOT NULL,
  "host" text NOT NULL,
  "is_primary" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "marketing_hosts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES public."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "marketing_hosts_host_normalized_check" CHECK ("host" = lower("host") AND position('/' in "host") = 0 AND position(':' in "host") = 0 AND "host" = btrim("host") AND length("host") > 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public."default_booking_links" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL,
  "marketing_host_id" text NOT NULL,
  "default_booking_tenant_id" text NOT NULL,
  "legal_entity_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "default_booking_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES public."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "default_booking_links_marketing_host_id_fk" FOREIGN KEY ("marketing_host_id") REFERENCES public."marketing_hosts"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "default_booking_links_default_booking_tenant_id_fk" FOREIGN KEY ("default_booking_tenant_id") REFERENCES public."tenants"("id") ON DELETE no action ON UPDATE no action,
  CONSTRAINT "default_booking_links_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES public."legal_entities"("id") ON DELETE no action ON UPDATE no action
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "legal_entities_tenant_idx" ON public."legal_entities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketing_hosts_tenant_idx" ON public."marketing_hosts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_hosts_host_uq" ON public."marketing_hosts" USING btree ("host");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_hosts_primary_tenant_uq" ON public."marketing_hosts" USING btree ("tenant_id") WHERE "is_primary" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "default_booking_links_tenant_uq" ON public."default_booking_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "default_booking_links_marketing_host_uq" ON public."default_booking_links" USING btree ("marketing_host_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "default_booking_links_booking_tenant_idx" ON public."default_booking_links" USING btree ("default_booking_tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "default_booking_links_legal_entity_idx" ON public."default_booking_links" USING btree ("legal_entity_id");--> statement-breakpoint

INSERT INTO public."legal_entities" ("id", "tenant_id", "legal_name", "country_code", "governing_law", "terms_version", "currency", "tax_id", "address", "contact", "is_active")
SELECT t."id", t."id", t."legal_name", t."country_code", t."governing_law", t."terms_version", t."currency", t."tax_id", t."address", t."contact", t."is_active"
FROM public."tenants" t
ON CONFLICT ("id") DO UPDATE SET
  "tenant_id" = excluded."tenant_id",
  "legal_name" = excluded."legal_name",
  "country_code" = excluded."country_code",
  "governing_law" = excluded."governing_law",
  "terms_version" = excluded."terms_version",
  "currency" = excluded."currency",
  "tax_id" = excluded."tax_id",
  "address" = excluded."address",
  "contact" = excluded."contact",
  "is_active" = excluded."is_active",
  "updated_at" = now();--> statement-breakpoint

WITH tenant_host_candidates AS (
  SELECT t."id" AS tenant_id, t."is_active",
    CASE t."id"
      WHEN 'tenant_mk' THEN 'mk'
      WHEN 'tenant_ks' THEN 'ks'
      WHEN 'tenant_al' THEN 'al'
      WHEN 'pilot-mk' THEN 'pilot'
      ELSE lower(regexp_replace(coalesce(nullif(t."code", ''), t."id"), '[^a-zA-Z0-9-]+', '-', 'g'))
    END AS base_host_label
  FROM public."tenants" t
),
tenant_hosts AS (
  SELECT tenant_id, is_active,
    CASE
      WHEN count(*) OVER (PARTITION BY base_host_label) > 1 THEN base_host_label || '-' || lower(regexp_replace(tenant_id, '[^a-zA-Z0-9-]+', '-', 'g'))
      ELSE base_host_label
    END AS host_label
  FROM tenant_host_candidates
)
INSERT INTO public."marketing_hosts" ("id", "tenant_id", "label", "host", "is_primary", "is_active")
SELECT tenant_id || ':primary-host', tenant_id, host_label, host_label || '.interdomestik.com', true, "is_active"
FROM tenant_hosts
ON CONFLICT ("id") DO UPDATE SET
  "tenant_id" = excluded."tenant_id",
  "label" = excluded."label",
  "host" = excluded."host",
  "is_primary" = excluded."is_primary",
  "is_active" = excluded."is_active",
  "updated_at" = now();--> statement-breakpoint

INSERT INTO public."default_booking_links" ("id", "tenant_id", "marketing_host_id", "default_booking_tenant_id", "legal_entity_id")
SELECT t."id" || ':default-booking', t."id", mh."id", t."id", le."id"
FROM public."tenants" t
JOIN public."marketing_hosts" mh ON mh."id" = t."id" || ':primary-host'
JOIN public."legal_entities" le ON le."id" = t."id"
ON CONFLICT ("id") DO UPDATE SET
  "tenant_id" = excluded."tenant_id",
  "marketing_host_id" = excluded."marketing_host_id",
  "default_booking_tenant_id" = excluded."default_booking_tenant_id",
  "legal_entity_id" = excluded."legal_entity_id",
  "updated_at" = now();--> statement-breakpoint

ALTER TABLE public."subscriptions" ADD COLUMN IF NOT EXISTS "legal_entity_id" text;--> statement-breakpoint
WITH subscription_legal_entities AS (
  SELECT s."id", coalesce(legal_le."id", home_le."id") AS legal_entity_id
  FROM public."subscriptions" s
  LEFT JOIN public."legal_entities" legal_le ON legal_le."id" = s."legal_tenant_id"
  LEFT JOIN public."legal_entities" home_le ON home_le."id" = s."tenant_id"
)
UPDATE public."subscriptions" s
SET "legal_entity_id" = sle.legal_entity_id
FROM subscription_legal_entities sle
WHERE s."id" = sle."id"
  AND sle.legal_entity_id IS NOT NULL
  AND (s."legal_entity_id" IS NULL OR NOT EXISTS (SELECT 1 FROM public."legal_entities" existing WHERE existing."id" = s."legal_entity_id"));--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE n.nspname = 'public' AND r.relname = 'subscriptions' AND c.conname = 'subscriptions_legal_entity_id_fk') THEN
    ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_legal_entity_id_fk" FOREIGN KEY ("legal_entity_id") REFERENCES public."legal_entities"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END;
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_legal_entity_idx" ON public."subscriptions" USING btree ("legal_entity_id");--> statement-breakpoint

DO $$
DECLARE
  target record;
  policy_expr constant text := 'tenant_id = (select current_setting(''app.current_tenant_id'', true))::text';
BEGIN
  FOR target IN SELECT * FROM (VALUES ('legal_entities'), ('marketing_hosts'), ('default_booking_links')) AS t(table_name)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', format('tenant_isolation_%s', target.table_name), target.table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', format('tenant_isolation_%s', target.table_name), target.table_name, policy_expr, policy_expr);
  END LOOP;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE VIEW public."tenant_entity_boundaries" AS
SELECT dbl."tenant_id" AS "home_tenant_id", le."id" AS "legal_entity_id", mh."id" AS "marketing_host_id",
  dbl."id" AS "default_booking_link_id", dbl."default_booking_tenant_id",
  coalesce(t."name", le."legal_name") AS "tenant_name", le."legal_name", le."governing_law", le."terms_version",
  mh."host" AS "marketing_host", mh."label" AS "marketing_host_label"
FROM public."default_booking_links" dbl
LEFT JOIN public."tenants" t ON t."id" = dbl."tenant_id"
LEFT JOIN public."legal_entities" le ON le."id" = dbl."legal_entity_id"
LEFT JOIN public."marketing_hosts" mh ON mh."id" = dbl."marketing_host_id"
WHERE dbl."tenant_id" = (select current_setting('app.current_tenant_id', true))::text;--> statement-breakpoint
ALTER VIEW public."tenant_entity_boundaries" SET (security_invoker = true);--> statement-breakpoint

COMMENT ON TABLE public."legal_entities" IS 'T-504 legal entity authority split from tenants; one row per existing tenant at backfill, no member migration.';--> statement-breakpoint
COMMENT ON TABLE public."marketing_hosts" IS 'T-504 durable marketing host aliases; host/default booking hints do not grant access tenant authority.';--> statement-breakpoint
COMMENT ON TABLE public."default_booking_links" IS 'T-504 explicit marketing host to default booking tenant and legal entity mapping.';--> statement-breakpoint
COMMENT ON COLUMN public."subscriptions"."legal_entity_id" IS 'T-504 compatibility FK to legal_entities; legal_tenant_id remains the historical tenant compatibility column until later cutover.';--> statement-breakpoint

DO $$
DECLARE
  missing_legal integer; missing_host integer; missing_booking integer; unresolved_subscriptions integer; unmapped_subscriptions integer;
  legal_count integer; host_count integer; booking_count integer; subscription_link_count integer;
BEGIN
  SELECT count(*) INTO missing_legal FROM public."tenants" t WHERE NOT EXISTS (SELECT 1 FROM public."legal_entities" le WHERE le."tenant_id" = t."id");
  SELECT count(*) INTO missing_host FROM public."tenants" t WHERE NOT EXISTS (SELECT 1 FROM public."marketing_hosts" mh WHERE mh."tenant_id" = t."id");
  SELECT count(*) INTO missing_booking FROM public."tenants" t WHERE NOT EXISTS (SELECT 1 FROM public."default_booking_links" dbl WHERE dbl."tenant_id" = t."id" AND dbl."default_booking_tenant_id" = t."id");
  SELECT count(*) INTO unresolved_subscriptions FROM public."subscriptions" s WHERE s."legal_entity_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public."legal_entities" le WHERE le."id" = s."legal_entity_id");
  SELECT count(*) INTO unmapped_subscriptions FROM public."subscriptions" s WHERE s."legal_entity_id" IS NULL AND EXISTS (SELECT 1 FROM public."legal_entities" le WHERE le."id" = s."tenant_id");
  IF missing_legal > 0 OR missing_host > 0 OR missing_booking > 0 OR unresolved_subscriptions > 0 OR unmapped_subscriptions > 0 THEN
    RAISE EXCEPTION 'T-504 unresolved references legal=%, host=%, booking=%, subscriptions=%, unmapped_subscriptions=%', missing_legal, missing_host, missing_booking, unresolved_subscriptions, unmapped_subscriptions;
  END IF;
  SELECT count(*) INTO legal_count FROM public."legal_entities";
  SELECT count(*) INTO host_count FROM public."marketing_hosts";
  SELECT count(*) INTO booking_count FROM public."default_booking_links";
  SELECT count(*) INTO subscription_link_count FROM public."subscriptions" WHERE "legal_entity_id" IS NOT NULL;
  RAISE NOTICE 'T-504 entity decomposition backfill legal_entities=% marketing_hosts=% default_booking_links=% subscription_links=%', legal_count, host_count, booking_count, subscription_link_count;
END;
$$;
