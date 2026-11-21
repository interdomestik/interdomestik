CREATE TABLE "exchange_rate_books" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	CONSTRAINT "exchange_rate_books_tenant_pair_uq" UNIQUE("tenant_id","base","quote"),
	CONSTRAINT "exchange_rate_books_tenant_id_pair_uq" UNIQUE("tenant_id","id","base","quote"),
	CONSTRAINT "exchange_rate_books_pair_check" CHECK ("exchange_rate_books"."base" = 'EUR' and "exchange_rate_books"."quote" = 'MKD')
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"book_id" text NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"effective_on" date NOT NULL,
	"week_starts_on" date NOT NULL,
	"revision" integer NOT NULL,
	"corrects_rate_id" text,
	"correction_reason" text,
	"source" text NOT NULL,
	"caller_kind" text NOT NULL,
	"stored_by" text,
	"stored_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exchange_rates_tenant_book_week_revision_uq" UNIQUE("tenant_id","book_id","week_starts_on","revision"),
	CONSTRAINT "exchange_rates_tenant_id_book_date_uq" UNIQUE("tenant_id","id","book_id","effective_on"),
	CONSTRAINT "exchange_rates_tenant_id_book_pair_rate_date_uq" UNIQUE("tenant_id","id","book_id","base","quote","rate","effective_on"),
	CONSTRAINT "exchange_rates_positive_rate" CHECK ("exchange_rates"."rate" > 0 and "exchange_rates"."rate" <> 'NaN'::numeric),
	CONSTRAINT "exchange_rates_finite_effective_on" CHECK (isfinite("exchange_rates"."effective_on")),
	CONSTRAINT "exchange_rates_week_starts_on_iso_monday" CHECK ("exchange_rates"."week_starts_on" = "exchange_rates"."effective_on" - (extract(isodow from "exchange_rates"."effective_on")::int - 1)),
	CONSTRAINT "exchange_rates_source_check" CHECK ("exchange_rates"."source" = 'nbrm'),
	CONSTRAINT "exchange_rates_caller_kind_check" CHECK ("exchange_rates"."caller_kind" in ('staff', 'inngest')),
	CONSTRAINT "exchange_rates_revision_check" CHECK ("exchange_rates"."revision" >= 1 and ("exchange_rates"."revision" = 1) = ("exchange_rates"."corrects_rate_id" is null)),
	CONSTRAINT "exchange_rates_correction_reason_check" CHECK (("exchange_rates"."revision" = 1 and "exchange_rates"."correction_reason" is null) or ("exchange_rates"."revision" > 1 and "exchange_rates"."caller_kind" = 'staff' and "exchange_rates"."correction_reason" is not null and "exchange_rates"."correction_reason" ~ '\S')),
	CONSTRAINT "exchange_rates_stored_by_check" CHECK (("exchange_rates"."caller_kind" = 'staff') = ("exchange_rates"."stored_by" is not null))
);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exchange_rate_books" ADD CONSTRAINT "exchange_rate_books_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_book_fk" FOREIGN KEY ("tenant_id","book_id","base","quote") REFERENCES "public"."exchange_rate_books"("tenant_id","id","base","quote") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_correction_fk" FOREIGN KEY ("tenant_id","corrects_rate_id","book_id","effective_on") REFERENCES "public"."exchange_rates"("tenant_id","id","book_id","effective_on") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_stored_by_fk" FOREIGN KEY ("tenant_id","stored_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "exchange_rate_books_tenant_policy" ON "exchange_rate_books" AS PERMISSIVE FOR ALL TO public USING ("exchange_rate_books"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("exchange_rate_books"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "exchange_rates_tenant_policy" ON "exchange_rates" AS PERMISSIVE FOR ALL TO public USING ("exchange_rates"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("exchange_rates"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);
--> statement-breakpoint
-- Provision and backfill in the same migration so every legal-entity insert has a book.
CREATE FUNCTION public.provision_exchange_rate_book_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.exchange_rate_books (id, tenant_id, base, quote)
  VALUES (gen_random_uuid()::text, NEW.tenant_id, 'EUR', 'MKD')
  ON CONFLICT (tenant_id, base, quote) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER legal_entities_provision_exchange_rate_book
AFTER INSERT ON public.legal_entities
FOR EACH ROW EXECUTE FUNCTION public.provision_exchange_rate_book_fn();
--> statement-breakpoint
INSERT INTO public.exchange_rate_books (id, tenant_id, base, quote)
SELECT gen_random_uuid()::text, entity_tenants.tenant_id, 'EUR', 'MKD'
FROM (SELECT DISTINCT tenant_id FROM public.legal_entities) AS entity_tenants
ON CONFLICT (tenant_id, base, quote) DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.legal_entities AS entity
    LEFT JOIN public.exchange_rate_books AS book
      ON book.tenant_id = entity.tenant_id AND book.base = 'EUR' AND book.quote = 'MKD'
    WHERE book.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Exchange rate book backfill is incomplete';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "exchange_rate_books" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exchange_rates" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_reject_mutation_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE check_violation USING MESSAGE = format('%s is append-only', TG_TABLE_NAME);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exchange_rate_books_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.exchange_rate_books
FOR EACH STATEMENT EXECUTE FUNCTION public.exchange_rate_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER exchange_rates_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.exchange_rates
FOR EACH STATEMENT EXECUTE FUNCTION public.exchange_rate_reject_mutation_fn();
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_insert_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  iso_monday date;
  predecessor public.exchange_rates%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.exchange_rate_books AS book
    WHERE book.tenant_id = NEW.tenant_id AND book.id = NEW.book_id
      AND book.base = NEW.base AND book.quote = NEW.quote
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE foreign_key_violation USING
      CONSTRAINT = 'exchange_rates_book_fk', MESSAGE = 'Exchange rate book is missing';
  END IF;

  IF NEW.effective_on IS NULL OR NOT isfinite(NEW.effective_on) THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rates_finite_effective_on';
  END IF;
  iso_monday := NEW.effective_on - (extract(isodow FROM NEW.effective_on)::int - 1);
  IF NEW.week_starts_on IS NOT NULL AND NEW.week_starts_on <> iso_monday THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rates_week_starts_on_iso_monday';
  END IF;
  NEW.week_starts_on := iso_monday;

  IF NEW.corrects_rate_id IS NOT NULL THEN
    SELECT r.* INTO predecessor
    FROM public.exchange_rates AS r
    WHERE r.tenant_id = NEW.tenant_id AND r.book_id = NEW.book_id
      AND r.week_starts_on = iso_monday
    ORDER BY r.revision DESC
    LIMIT 1;
    IF NEW.corrects_rate_id IS DISTINCT FROM predecessor.id
       OR NEW.revision IS DISTINCT FROM predecessor.revision + 1 THEN
      RAISE check_violation USING MESSAGE = 'Exchange rate correction must revise the current rate';
    END IF;
  END IF;

  NEW.stored_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exchange_rates_insert_guard
BEFORE INSERT ON public.exchange_rates
FOR EACH ROW EXECUTE FUNCTION public.exchange_rate_insert_guard_fn();
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.exchange_rate_books, public.exchange_rates FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    REVOKE UPDATE, DELETE, TRUNCATE
      ON public.exchange_rate_books, public.exchange_rates FROM interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.exchange_rate_books, public.exchange_rates
      TO interdomestik_runtime_rls;
    -- PostgreSQL requires an UPDATE privilege for row locking. The statement trigger
    -- rejects actual updates, including updates that would touch zero rows.
    GRANT UPDATE (id) ON public.exchange_rate_books TO interdomestik_runtime_rls;
  END IF;
END;
$$;
