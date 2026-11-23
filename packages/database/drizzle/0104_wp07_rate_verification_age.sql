CREATE TABLE "exchange_rate_verification_limits" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"max_age_seconds" integer NOT NULL,
	CONSTRAINT "exchange_rate_verification_limits_max_age_check" CHECK ("exchange_rate_verification_limits"."max_age_seconds" >= 1 and "exchange_rate_verification_limits"."max_age_seconds" <= 2678400)
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_verification_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exchange_rate_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"book_id" text NOT NULL,
	"rate_id" text NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate_effective_on" date NOT NULL,
	"observed_rate" numeric NOT NULL,
	"source_ref" text NOT NULL,
	"verified_by" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"operation_key" uuid NOT NULL,
	CONSTRAINT "exchange_rate_verifications_operation_uq" UNIQUE("tenant_id","operation_key"),
	CONSTRAINT "exchange_rate_verifications_pair_check" CHECK ("exchange_rate_verifications"."base" = 'EUR' and "exchange_rate_verifications"."quote" = 'MKD'),
	CONSTRAINT "exchange_rate_verifications_finite_stamps" CHECK (isfinite("exchange_rate_verifications"."rate_effective_on") and isfinite("exchange_rate_verifications"."verified_at")),
	CONSTRAINT "exchange_rate_verifications_observed_rate_check" CHECK ("exchange_rate_verifications"."observed_rate" > 0 and "exchange_rate_verifications"."observed_rate" <= 9999999999.99999999 and scale("exchange_rate_verifications"."observed_rate") <= 8),
	CONSTRAINT "exchange_rate_verifications_source_ref_check" CHECK ("exchange_rate_verifications"."source_ref" collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$')
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exchange_rate_verification_limits" ADD CONSTRAINT "exchange_rate_verification_limits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ADD CONSTRAINT "exchange_rate_verifications_exact_rate_fk" FOREIGN KEY ("tenant_id","rate_id","book_id","base","quote","observed_rate","rate_effective_on") REFERENCES "public"."exchange_rates"("tenant_id","id","book_id","base","quote","rate","effective_on") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ADD CONSTRAINT "exchange_rate_verifications_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ADD CONSTRAINT "exchange_rate_verifications_actor_fk" FOREIGN KEY ("tenant_id","verified_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rate_verifications_latest_idx" ON "exchange_rate_verifications" USING btree ("tenant_id","book_id","rate_id","verified_at");--> statement-breakpoint
CREATE POLICY "exchange_rate_verification_limits_tenant_policy" ON "exchange_rate_verification_limits" AS PERMISSIVE FOR ALL TO public USING ("exchange_rate_verification_limits"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("exchange_rate_verification_limits"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "exchange_rate_verifications_tenant_policy" ON "exchange_rate_verifications" AS PERMISSIVE FOR ALL TO public USING ("exchange_rate_verifications"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("exchange_rate_verifications"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);
--> statement-breakpoint
ALTER TABLE "exchange_rate_verification_limits" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_verifications_insert_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actual_rate_id text;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_read_committed_guard';
  END IF;

  PERFORM 1 FROM public.exchange_rate_books AS book
  WHERE book.tenant_id = NEW.tenant_id AND book.id = NEW.book_id
    AND book.base = NEW.base AND book.quote = NEW.quote
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE foreign_key_violation USING
      CONSTRAINT = 'exchange_rate_verifications_book_fk', MESSAGE = 'Exchange rate book is missing';
  END IF;

  PERFORM 1 FROM public.legal_entities AS entity
  WHERE entity.tenant_id = NEW.tenant_id AND entity.id = NEW.legal_entity_id AND entity.is_active
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_active_entity';
  END IF;

  NEW.verified_at := clock_timestamp();

  SELECT r.id INTO actual_rate_id
  FROM public.exchange_rates AS r
  WHERE r.tenant_id = NEW.tenant_id AND r.book_id = NEW.book_id
    AND r.stored_at <= NEW.verified_at
    AND r.effective_on <= (NEW.verified_at AT TIME ZONE 'Europe/Skopje')::date
  ORDER BY r.effective_on DESC, r.revision DESC LIMIT 1;
  IF actual_rate_id IS NULL OR actual_rate_id IS DISTINCT FROM NEW.rate_id THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_current_rate';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exchange_rate_verifications_insert_guard
BEFORE INSERT ON public.exchange_rate_verifications
FOR EACH ROW EXECUTE FUNCTION public.exchange_rate_verifications_insert_guard_fn();
--> statement-breakpoint
CREATE TRIGGER exchange_rate_verifications_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.exchange_rate_verifications
FOR EACH STATEMENT EXECUTE FUNCTION public.exchange_rate_reject_mutation_fn();
--> statement-breakpoint
CREATE FUNCTION public.membership_sale_rate_verification_age_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- The individual insert guard already holds the book lock and stamped the sale.
  PERFORM 1 FROM public.exchange_rate_verification_limits AS policy
  CROSS JOIN LATERAL (
    SELECT verification.verified_at
    FROM public.exchange_rate_verifications AS verification
    WHERE verification.tenant_id = NEW.tenant_id AND verification.book_id = NEW.rate_book_id
      AND verification.rate_id = NEW.rate_id AND verification.verified_at <= NEW.sold_at
    ORDER BY verification.verified_at DESC LIMIT 1
  ) AS latest
  WHERE policy.tenant_id = NEW.tenant_id
    AND extract(epoch FROM (NEW.sold_at - latest.verified_at)) <= policy.max_age_seconds;
  IF NOT FOUND THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_stale_rate';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_sales_z_rate_verification_age
BEFORE INSERT ON public.membership_sales
FOR EACH ROW WHEN (NEW.kind = 'individual')
EXECUTE FUNCTION public.membership_sale_rate_verification_age_fn();
--> statement-breakpoint
REVOKE ALL ON public.exchange_rate_verifications, public.exchange_rate_verification_limits FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    REVOKE ALL ON public.exchange_rate_verifications, public.exchange_rate_verification_limits
      FROM interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.exchange_rate_verifications TO interdomestik_runtime_rls;
    GRANT SELECT ON public.exchange_rate_verification_limits TO interdomestik_runtime_rls;
  END IF;
END;
$$;
