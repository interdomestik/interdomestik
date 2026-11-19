-- WP-04 (R-12; DB-BASELINE DB-27, finding DATA-14): a database built from the journal now equals
-- the declared schema. These statements stood in four files outside the journal, which the
-- migrator never applied (0015 to 0018, removed in the same change):
-- * 0015: the tenant column keeps no default, so a write must name its tenant (R-17). Its
--   backfill updates are not carried: they assign a literal tenant and find no row on a new
--   database. DROP DEFAULT is a no-op where no default exists.
-- * 0017 and 0018: the declared indexes that no journaled migration created.
-- * The declared column crm_activities.description, which no migration created.
-- Not carried, because the journal already holds their effect or the schema does not declare it:
-- 0016 (RLS and the deny policies on account, session and verification exist; "user" has its tenant
-- policy), idx_agent_commissions_tenant_id (exists), idx_claims_status (not declared).
-- Every target is schema-qualified, so a same-name relation earlier in the search_path is never
-- the one changed.
-- Expand only, with no rollback DDL: an application rollback keeps the additive objects. The
-- previous build already writes crm_activities.description (where the column existed outside the
-- journal it holds data) and ignores extra indexes; defaults are not restored. An object that
-- already exists is kept only if its definition is the declared one; any other same-name object
-- fails this migration, so it is never recorded as applied over an incompatible object. On a
-- shared database a unique index fails on duplicate rows; the release step (WP-15) runs it.

ALTER TABLE "public"."user" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."claim" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."claim_documents" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."claim_messages" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."claim_stage_history" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."subscriptions" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."membership_plans" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."membership_family_members" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."user_notification_preferences" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."push_subscriptions" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."agent_clients" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."agent_commissions" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."agent_settings" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."policies" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."notifications" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."email_campaign_logs" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."automation_logs" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."engagement_email_sends" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."nps_survey_tokens" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."nps_survey_responses" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."crm_leads" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."crm_activities" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."crm_deals" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."leads" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."referrals" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."service_usage" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."service_requests" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."partner_discount_usage" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."lead_downloads" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."member_notes" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."audit_log" ALTER COLUMN "tenant_id" DROP DEFAULT;--> statement-breakpoint
DO $wp04$
DECLARE
  wanted record;
  existing record;
  declared_definition text;
BEGIN
  FOR wanted IN
    SELECT * FROM (VALUES
      ('agent_commissions_tenant_subscription_type_uq', 'agent_commissions', true,
        ARRAY['tenant_id', 'subscription_id', 'type']),
      ('branches_tenant_code_uq', 'branches', true, ARRAY['tenant_id', 'code']),
      ('idx_claims_user_created', 'claim', false, ARRAY['userId', 'createdAt']),
      ('idx_policies_user_tenant_created', 'policies', false,
        ARRAY['user_id', 'tenant_id', 'created_at'])
    ) AS declared(index_name, table_name, is_unique, key_columns)
  LOOP
    -- PostgreSQL's own rendering after the name and table carries the method, key order,
    -- collation, operator class, direction, NULLS NOT DISTINCT, INCLUDE, WITH and predicate.
    declared_definition := format('USING btree (%s)',
      (SELECT string_agg(quote_ident(c), ', ') FROM unnest(wanted.key_columns) AS c));
    SELECT t.relname AS table_name, ix.indisunique AS is_unique,
      ix.indisvalid AND ix.indisready AND ix.indislive AS is_valid,
      EXISTS (
        SELECT 1 FROM pg_constraint con
        WHERE con.conindid = i.oid AND con.contype IN ('p', 'u', 'x')
      ) AS is_constraint,
      regexp_replace(pg_get_indexdef(i.oid), '^CREATE (UNIQUE )?INDEX \S+ ON \S+ ', '')
        AS definition
    INTO existing
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    WHERE n.nspname = 'public' AND i.relname = wanted.index_name;
    IF NOT FOUND THEN
      EXECUTE format(
        'CREATE %s INDEX %I ON public.%I USING btree (%s)',
        CASE WHEN wanted.is_unique THEN 'UNIQUE' ELSE '' END,
        wanted.index_name,
        wanted.table_name,
        (SELECT string_agg(quote_ident(c), ', ') FROM unnest(wanted.key_columns) AS c)
      );
    ELSIF existing.table_name <> wanted.table_name OR existing.is_unique <> wanted.is_unique
      OR NOT existing.is_valid OR existing.is_constraint
      OR existing.definition <> declared_definition THEN
      RAISE EXCEPTION 'WP-04: index % exists with another definition', wanted.index_name;
    END IF;
  END LOOP;

  SELECT format_type(a.atttypid, a.atttypmod) AS column_type, a.attnotnull AS not_null,
    a.attcollation <> 'pg_catalog."default"'::regcollation AS has_collation,
    a.attidentity <> '' OR a.attgenerated <> '' OR EXISTS (
      SELECT 1 FROM pg_attrdef d WHERE d.adrelid = a.attrelid AND d.adnum = a.attnum
    ) AS has_default
  INTO existing
  FROM pg_attribute a
  WHERE a.attrelid = 'public.crm_activities'::regclass AND a.attname = 'description'
    AND NOT a.attisdropped;
  IF NOT FOUND THEN
    ALTER TABLE public.crm_activities ADD COLUMN description text;
  ELSIF existing.column_type <> 'text' OR existing.not_null OR existing.has_default
    OR existing.has_collation THEN
    RAISE EXCEPTION 'WP-04: crm_activities.description exists with another definition';
  END IF;
END
$wp04$;
