CREATE UNIQUE INDEX "member_leads_tenant_id_id_uq" ON "member_leads" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE TABLE "membership_plan_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"legal_entity_id" text NOT NULL,
	"tier" text NOT NULL,
	"interval" text NOT NULL,
	"members_included" integer NOT NULL,
	"list_price_minor" bigint NOT NULL,
	"price_currency" text NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" text,
	CONSTRAINT "membership_plan_versions_number_uq" UNIQUE("tenant_id","plan_id","version"),
	CONSTRAINT "membership_plan_versions_sale_snapshot_uq" UNIQUE("tenant_id","id","plan_id","legal_entity_id","list_price_minor","price_currency","tier","members_included"),
	CONSTRAINT "membership_plan_versions_tier_check" CHECK (tier = ANY (enum_range(NULL::public.membership_tier)::text[])),
	CONSTRAINT "membership_plan_versions_terms_check" CHECK (
      "membership_plan_versions"."tier" <> 'family' and "membership_plan_versions"."interval" = 'year'
      and "membership_plan_versions"."price_currency" = 'EUR' and "membership_plan_versions"."list_price_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sale_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount_mkd_minor" bigint NOT NULL,
	CONSTRAINT "membership_ledger_entries_kind_check" CHECK ("membership_ledger_entries"."kind" = 'charge')
);
--> statement-breakpoint
ALTER TABLE "membership_ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_sale_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	CONSTRAINT "membership_sale_channels_kind_channel_uq" UNIQUE("kind","channel")
);
--> statement-breakpoint
ALTER TABLE "membership_sale_channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_sale_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"operation_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "membership_sale_claims_operation_uq" UNIQUE("tenant_id","operation_key"),
	CONSTRAINT "membership_sale_claims_hash_uq" UNIQUE("tenant_id","operation_key","request_hash"),
	CONSTRAINT "membership_sale_claims_operation_key_check" CHECK (char_length(operation_key) <= 255),
	CONSTRAINT "membership_sale_claims_hash_check" CHECK (request_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "membership_sale_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_sale_kinds" (
	"kind" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership_sale_kinds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_sales" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"plan_version_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"price_currency" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"governing_law" text NOT NULL,
	"terms_version" text NOT NULL,
	"rate_id" text NOT NULL,
	"rate_book_id" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"rate_base" text NOT NULL,
	"rate_quote" text NOT NULL,
	"rate_effective_on" date NOT NULL,
	"amount_mkd_minor" bigint NOT NULL,
	"channel" text NOT NULL,
	"sold_by" text NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"sold_on" date NOT NULL,
	"due_on" date NOT NULL,
	"operation_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text,
	"buyer_kind" text,
	"lead_id" text,
	"member_user_id" text,
	"list_price_minor" bigint,
	"plan_tier" text,
	"plan_members_included" integer,
	"agent_id" text,
	"branch_id" text,
	CONSTRAINT "membership_sales_charge_uq" UNIQUE("tenant_id","id","amount_mkd_minor"),
	CONSTRAINT "membership_sales_operation_uq" UNIQUE("tenant_id","operation_key"),
	CONSTRAINT "membership_sales_operation_key_check" CHECK (char_length(operation_key) <= 255),
	CONSTRAINT "membership_sales_conversion_check" CHECK (
      "membership_sales"."amount_mkd_minor" = round("membership_sales"."price_minor"::numeric * "membership_sales"."rate" * 0.01) * 100),
	CONSTRAINT "membership_sales_positive_check" CHECK ("membership_sales"."price_minor" > 0 and "membership_sales"."amount_mkd_minor" > 0),
	CONSTRAINT "membership_sales_request_hash_check" CHECK (request_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "membership_sales_plan_tier_check" CHECK (plan_tier IS NULL OR plan_tier = ANY (enum_range(NULL::public.membership_tier)::text[])),
	CONSTRAINT "membership_sales_individual_buyer_check" CHECK (
      "membership_sales"."kind" <> 'individual' or ("membership_sales"."buyer_kind" is not null and (
        ("membership_sales"."buyer_kind" = 'lead' and "membership_sales"."lead_id" is not null and "membership_sales"."member_user_id" is null)
        or ("membership_sales"."buyer_kind" = 'member' and "membership_sales"."member_user_id" is not null and "membership_sales"."lead_id" is null)
      ))),
	CONSTRAINT "membership_sales_individual_offer_check" CHECK (
      "membership_sales"."kind" <> 'individual' or (
        "membership_sales"."list_price_minor" is not null and "membership_sales"."price_minor" = "membership_sales"."list_price_minor"
        and "membership_sales"."due_on" = "membership_sales"."sold_on" and "membership_sales"."plan_tier" is not null
        and "membership_sales"."plan_tier" in ('basic', 'standard')
        and "membership_sales"."plan_members_included" is not null and "membership_sales"."plan_members_included" = 1
      ))
);
--> statement-breakpoint
ALTER TABLE "membership_sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_plan_fk" FOREIGN KEY ("tenant_id","plan_id") REFERENCES "public"."membership_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_publisher_fk" FOREIGN KEY ("tenant_id","published_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan_versions" ADD CONSTRAINT "membership_plan_versions_withdrawer_fk" FOREIGN KEY ("tenant_id","withdrawn_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_ledger_entries" ADD CONSTRAINT "membership_ledger_entries_amount_fk" FOREIGN KEY ("tenant_id","sale_id","amount_mkd_minor") REFERENCES "public"."membership_sales"("tenant_id","id","amount_mkd_minor") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sale_channels" ADD CONSTRAINT "membership_sale_channels_kind_membership_sale_kinds_kind_fk" FOREIGN KEY ("kind") REFERENCES "public"."membership_sale_kinds"("kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sale_claims" ADD CONSTRAINT "membership_sale_claims_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_kind_membership_sale_kinds_kind_fk" FOREIGN KEY ("kind") REFERENCES "public"."membership_sale_kinds"("kind") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_channel_fk" FOREIGN KEY ("kind","channel") REFERENCES "public"."membership_sale_channels"("kind","channel") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_claim_fk" FOREIGN KEY ("tenant_id","operation_key","request_hash") REFERENCES "public"."membership_sale_claims"("tenant_id","operation_key","request_hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_rate_fk" FOREIGN KEY ("tenant_id","rate_id","rate_book_id","rate_base","rate_quote","rate","rate_effective_on") REFERENCES "public"."exchange_rates"("tenant_id","id","book_id","base","quote","rate","effective_on") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_offer_fk" FOREIGN KEY ("tenant_id","plan_version_id","plan_id","legal_entity_id","list_price_minor","price_currency","plan_tier","plan_members_included") REFERENCES "public"."membership_plan_versions"("tenant_id","id","plan_id","legal_entity_id","list_price_minor","price_currency","tier","members_included") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_lead_fk" FOREIGN KEY ("tenant_id","lead_id") REFERENCES "public"."member_leads"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_member_fk" FOREIGN KEY ("tenant_id","member_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_seller_fk" FOREIGN KEY ("tenant_id","sold_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_agent_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_void_actor_fk" FOREIGN KEY ("tenant_id","voided_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_sales" ADD CONSTRAINT "membership_sales_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_ledger_entries_charge_uq" ON "membership_ledger_entries" USING btree ("tenant_id","sale_id") WHERE kind = 'charge';--> statement-breakpoint
CREATE UNIQUE INDEX "membership_sales_live_lead_uq" ON "membership_sales" USING btree ("tenant_id","lead_id") WHERE lead_id is not null and voided_at is null;--> statement-breakpoint
CREATE POLICY "membership_plan_versions_tenant_policy" ON "membership_plan_versions" AS PERMISSIVE FOR ALL TO public USING ("membership_plan_versions"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("membership_plan_versions"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "membership_ledger_entries_tenant_policy" ON "membership_ledger_entries" AS PERMISSIVE FOR ALL TO public USING ("membership_ledger_entries"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("membership_ledger_entries"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "membership_sale_channels_read_policy" ON "membership_sale_channels" AS PERMISSIVE FOR SELECT TO public USING (nullif(btrim(current_setting('app.current_access_tenant_id', true)), '') is not null);--> statement-breakpoint
CREATE POLICY "membership_sale_claims_tenant_policy" ON "membership_sale_claims" AS PERMISSIVE FOR ALL TO public USING ("membership_sale_claims"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("membership_sale_claims"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "membership_sale_kinds_read_policy" ON "membership_sale_kinds" AS PERMISSIVE FOR SELECT TO public USING (nullif(btrim(current_setting('app.current_access_tenant_id', true)), '') is not null);--> statement-breakpoint
CREATE POLICY "membership_sales_tenant_policy" ON "membership_sales" AS PERMISSIVE FOR ALL TO public USING ("membership_sales"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("membership_sales"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);
--> statement-breakpoint
INSERT INTO public.membership_sale_kinds (kind) VALUES ('individual');
--> statement-breakpoint
INSERT INTO public.membership_sale_channels (kind, channel)
VALUES ('individual', 'cash'), ('individual', 'bank_transfer');
--> statement-breakpoint
ALTER TABLE public.membership_sale_kinds FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_sale_channels FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_plan_versions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_sale_claims FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_sales FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_ledger_entries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION public.membership_plan_version_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan public.membership_plans%ROWTYPE;
  entity public.legal_entities%ROWTYPE;
  next_version integer;
BEGIN
  SELECT p.* INTO plan FROM public.membership_plans AS p
  WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.plan_id
  FOR UPDATE;

  IF TG_OP = 'UPDATE' THEN
    IF plan.id IS NULL OR OLD.withdrawn_at IS NOT NULL OR OLD.withdrawn_by IS NOT NULL
       OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL
       OR to_jsonb(NEW) - ARRAY['withdrawn_at', 'withdrawn_by']
          IS DISTINCT FROM to_jsonb(OLD) - ARRAY['withdrawn_at', 'withdrawn_by'] THEN
      RAISE check_violation USING CONSTRAINT = 'membership_plan_versions_withdrawal_guard';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.withdrawn_at IS NOT NULL OR NEW.withdrawn_by IS NOT NULL THEN
    RAISE check_violation USING CONSTRAINT = 'membership_plan_versions_withdrawal_guard';
  END IF;

  SELECT e.* INTO entity FROM public.legal_entities AS e
  WHERE e.tenant_id = NEW.tenant_id AND e.id = NEW.legal_entity_id
  FOR SHARE;

  SELECT coalesce(max(v.version), 0) + 1 INTO next_version
  FROM public.membership_plan_versions AS v
  WHERE v.tenant_id = NEW.tenant_id AND v.plan_id = NEW.plan_id;

  IF plan.is_active IS NOT TRUE OR entity.is_active IS NOT TRUE
     OR nullif(btrim(entity.governing_law, E' \t\r\n'), '') IS NULL
     OR nullif(btrim(entity.terms_version, E' \t\r\n'), '') IS NULL
     OR NEW.tier IS DISTINCT FROM plan.tier::text OR NEW.interval IS DISTINCT FROM plan.interval
     OR NEW.members_included IS DISTINCT FROM plan.members_included
     OR NEW.price_currency IS DISTINCT FROM plan.currency
     OR NEW.list_price_minor IS DISTINCT FROM plan.price * 100
     OR NEW.version IS DISTINCT FROM next_version THEN
    RAISE check_violation USING CONSTRAINT = 'membership_plan_versions_copy_guard';
  END IF;
  NEW.published_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_plan_versions_copy_and_withdrawal
BEFORE INSERT OR UPDATE ON public.membership_plan_versions
FOR EACH ROW EXECUTE FUNCTION public.membership_plan_version_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_port_reject_mutation_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE check_violation USING MESSAGE = format('%s is immutable for this operation', TG_TABLE_NAME);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_plan_versions_no_delete
BEFORE DELETE OR TRUNCATE ON public.membership_plan_versions
FOR EACH STATEMENT EXECUTE FUNCTION public.membership_port_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER membership_sale_claims_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.membership_sale_claims
FOR EACH STATEMENT EXECUTE FUNCTION public.membership_port_reject_mutation_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_sale_claim_assign_id_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.id := gen_random_uuid();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_sale_claims_assign_id
BEFORE INSERT ON public.membership_sale_claims
FOR EACH ROW EXECUTE FUNCTION public.membership_sale_claim_assign_id_fn();
--> statement-breakpoint
CREATE TRIGGER membership_ledger_entries_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.membership_ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION public.membership_port_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER membership_sales_no_delete
BEFORE DELETE OR TRUNCATE ON public.membership_sales
FOR EACH STATEMENT EXECUTE FUNCTION public.membership_port_reject_mutation_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_sale_void_state_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
      RAISE check_violation USING CONSTRAINT = 'membership_sales_void_state_guard';
    END IF;
  ELSIF OLD.voided_at IS NOT NULL OR OLD.voided_by IS NOT NULL OR OLD.void_reason IS NOT NULL
     OR NEW.voided_at IS NULL OR NEW.voided_by IS NULL OR NEW.void_reason IS NULL
     OR to_jsonb(NEW) - ARRAY['voided_at', 'voided_by', 'void_reason']
        IS DISTINCT FROM to_jsonb(OLD) - ARRAY['voided_at', 'voided_by', 'void_reason'] THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_void_state_guard';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_sales_void_state
BEFORE INSERT OR UPDATE ON public.membership_sales
FOR EACH ROW EXECUTE FUNCTION public.membership_sale_void_state_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_individual_sale_hash(
  buyer_kind text, buyer_id text, plan_version_id text, terms_version text,
  rate_id text, amount_mkd_minor bigint, channel text
)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT encode(sha256(string_agg(int4send(octet_length(field)) || field, ''::bytea ORDER BY position)), 'hex')
  FROM (
    SELECT convert_to(value, 'UTF8') AS field, position
    FROM unnest(ARRAY[
      'individual:v1', buyer_kind, buyer_id, plan_version_id, terms_version,
      rate_id, amount_mkd_minor::text, channel
    ]) WITH ORDINALITY AS fields(value, position)
  ) AS encoded;
$$;
--> statement-breakpoint
CREATE FUNCTION public.membership_individual_sale_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan_active boolean;
  entity public.legal_entities%ROWTYPE;
  offer public.membership_plan_versions%ROWTYPE;
  actual_rate_id text;
  actual_agent_id text;
  actual_branch_id text;
  buyer_id text;
  digest text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_read_committed_guard';
  END IF;

  PERFORM 1 FROM public.exchange_rate_books AS book
  WHERE book.tenant_id = NEW.tenant_id AND book.id = NEW.rate_book_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_stale_rate';
  END IF;

  SELECT p.is_active INTO plan_active FROM public.membership_plans AS p
  WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.plan_id
  FOR SHARE;

  SELECT e.* INTO entity FROM public.legal_entities AS e
  WHERE e.tenant_id = NEW.tenant_id AND e.id = NEW.legal_entity_id
  FOR SHARE;

  IF NEW.buyer_kind = 'lead' AND NEW.member_user_id IS NULL THEN
    SELECT l.id, l.agent_id, l.branch_id INTO buyer_id, actual_agent_id, actual_branch_id
    FROM public.member_leads AS l
    WHERE l.tenant_id = NEW.tenant_id AND l.id = NEW.lead_id AND l.lead_kind = 'individual'
    FOR SHARE;
  ELSIF NEW.buyer_kind = 'member' AND NEW.lead_id IS NULL THEN
    SELECT u.id, u.branch_id INTO buyer_id, actual_branch_id
    FROM public."user" AS u
    WHERE u.tenant_id = NEW.tenant_id AND u.id = NEW.member_user_id AND u.role = 'member'
    FOR SHARE;
  END IF;

  NEW.sold_at := clock_timestamp();
  NEW.sold_on := (NEW.sold_at AT TIME ZONE 'Europe/Skopje')::date;
  NEW.due_on := coalesce(NEW.due_on, NEW.sold_on);

  SELECT v.* INTO offer FROM public.membership_plan_versions AS v
  WHERE v.tenant_id = NEW.tenant_id AND v.plan_id = NEW.plan_id AND v.withdrawn_at IS NULL
  ORDER BY v.version DESC LIMIT 1;
  IF plan_active IS NOT TRUE OR entity.is_active IS NOT TRUE
     OR offer.id IS NULL OR offer.id IS DISTINCT FROM NEW.plan_version_id
     OR offer.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR offer.tier NOT IN ('basic', 'standard') OR offer.members_included <> 1
     OR nullif(btrim(entity.governing_law, E' \t\r\n'), '') IS NULL
     OR nullif(btrim(entity.terms_version, E' \t\r\n'), '') IS NULL
     OR entity.governing_law IS DISTINCT FROM NEW.governing_law
     OR entity.terms_version IS DISTINCT FROM NEW.terms_version THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_stale_offer';
  END IF;

  SELECT r.id INTO actual_rate_id
  FROM public.exchange_rates AS r
  WHERE r.tenant_id = NEW.tenant_id AND r.book_id = NEW.rate_book_id
    AND r.stored_at <= NEW.sold_at AND r.effective_on <= NEW.sold_on
  ORDER BY r.effective_on DESC, r.revision DESC LIMIT 1;
  IF actual_rate_id IS NULL OR actual_rate_id IS DISTINCT FROM NEW.rate_id THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_stale_rate';
  END IF;

  IF buyer_id IS NULL THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_individual_buyer_guard';
  END IF;
  IF NEW.agent_id IS DISTINCT FROM actual_agent_id OR NEW.branch_id IS DISTINCT FROM actual_branch_id THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_attribution_guard';
  END IF;

  digest := public.membership_individual_sale_hash(
    NEW.buyer_kind, buyer_id, NEW.plan_version_id, NEW.terms_version,
    NEW.rate_id, NEW.amount_mkd_minor, NEW.channel
  );
  IF digest IS NULL OR digest IS DISTINCT FROM NEW.request_hash THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_request_hash_guard';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_sales_individual_insert
BEFORE INSERT ON public.membership_sales
FOR EACH ROW WHEN (NEW.kind = 'individual')
EXECUTE FUNCTION public.membership_individual_sale_guard_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_sale_post_charge_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.membership_ledger_entries (id, tenant_id, sale_id, kind, amount_mkd_minor)
  VALUES (gen_random_uuid()::text, NEW.tenant_id, NEW.id, 'charge', NEW.amount_mkd_minor);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_sales_post_charge
AFTER INSERT ON public.membership_sales
FOR EACH ROW EXECUTE FUNCTION public.membership_sale_post_charge_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_sale_require_charge_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.membership_ledger_entries AS entry
    WHERE entry.tenant_id = NEW.tenant_id AND entry.sale_id = NEW.id
      AND entry.amount_mkd_minor = NEW.amount_mkd_minor AND entry.kind = 'charge'
  ) THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_require_charge';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER membership_sales_require_charge
AFTER INSERT ON public.membership_sales DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.membership_sale_require_charge_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_claim_require_sale_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.membership_sales AS sale
    WHERE sale.tenant_id = NEW.tenant_id AND sale.operation_key = NEW.operation_key
      AND sale.request_hash = NEW.request_hash
  ) THEN
    RAISE check_violation USING CONSTRAINT = 'membership_claims_require_sale';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER membership_claims_require_sale
AFTER INSERT ON public.membership_sale_claims DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.membership_claim_require_sale_fn();
--> statement-breakpoint
REVOKE ALL ON public.membership_sale_kinds, public.membership_sale_channels,
  public.membership_plan_versions, public.membership_sale_claims,
  public.membership_sales, public.membership_ledger_entries FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    REVOKE ALL ON public.membership_sale_kinds, public.membership_sale_channels,
      public.membership_plan_versions, public.membership_sale_claims,
      public.membership_sales, public.membership_ledger_entries FROM interdomestik_runtime_rls;
    GRANT SELECT ON public.membership_sale_kinds, public.membership_sale_channels TO interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.membership_plan_versions,
      public.membership_sales, public.membership_ledger_entries TO interdomestik_runtime_rls;
    GRANT INSERT ON public.membership_sale_claims TO interdomestik_runtime_rls;
    GRANT SELECT (tenant_id, operation_key, request_hash) ON public.membership_sale_claims TO interdomestik_runtime_rls;
    GRANT UPDATE (withdrawn_at, withdrawn_by) ON public.membership_plan_versions TO interdomestik_runtime_rls;
  END IF;
END;
$$;
