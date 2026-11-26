CREATE TABLE "exchange_rate_check_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"book_id" text NOT NULL,
	"window_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"rate_id" text,
	"rate_effective_on" date,
	"kind" text NOT NULL,
	"check_id" text,
	"start_order" bigint,
	"occurred_at" timestamp with time zone NOT NULL,
	"operation_key" uuid NOT NULL,
	"observed_rate" numeric,
	"source_ref" text,
	"reason" text,
	CONSTRAINT "exchange_rate_check_events_operation_uq" UNIQUE("tenant_id","operation_key"),
	CONSTRAINT "exchange_rate_check_events_order_uq" UNIQUE("tenant_id","book_id","start_order"),
	CONSTRAINT "exchange_rate_check_events_terminal_uq" UNIQUE("tenant_id","book_id","check_id"),
	CONSTRAINT "exchange_rate_check_events_window_scope_uq" UNIQUE("tenant_id","book_id","window_id","id"),
	CONSTRAINT "exchange_rate_check_events_attestation_uq" UNIQUE("tenant_id","book_id","id","legal_entity_id","actor_id","rate_id"),
	CONSTRAINT "exchange_rate_check_events_shape" CHECK (isfinite("exchange_rate_check_events"."occurred_at")
        and ("exchange_rate_check_events"."rate_id" is null) = ("exchange_rate_check_events"."rate_effective_on" is null)
        and (
          ("exchange_rate_check_events"."kind" = 'start' and "exchange_rate_check_events"."check_id" is null and "exchange_rate_check_events"."start_order" is not null
            and "exchange_rate_check_events"."observed_rate" is null and "exchange_rate_check_events"."source_ref" is null and "exchange_rate_check_events"."reason" is null)
          or ("exchange_rate_check_events"."kind" = 'mismatch' and "exchange_rate_check_events"."check_id" is not null and "exchange_rate_check_events"."start_order" is null
            and "exchange_rate_check_events"."rate_id" is not null and "exchange_rate_check_events"."observed_rate" is not null
            and "exchange_rate_check_events"."source_ref" is not null and "exchange_rate_check_events"."reason" is null)
          or ("exchange_rate_check_events"."kind" = 'inconclusive' and "exchange_rate_check_events"."check_id" is not null and "exchange_rate_check_events"."start_order" is null
            and "exchange_rate_check_events"."observed_rate" is null and "exchange_rate_check_events"."source_ref" is null and "exchange_rate_check_events"."reason" is not null)
        )),
	CONSTRAINT "exchange_rate_check_events_mismatch_evidence" CHECK ("exchange_rate_check_events"."observed_rate" > 0 and "exchange_rate_check_events"."observed_rate" <= 9999999999.99999999
        and scale("exchange_rate_check_events"."observed_rate") <= 8
        and "exchange_rate_check_events"."source_ref" collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$'),
	CONSTRAINT "exchange_rate_check_events_reason" CHECK (char_length("exchange_rate_check_events"."reason") <= 256 and "exchange_rate_check_events"."reason" ~ '\S')
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_check_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exchange_rate_check_windows" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"book_id" text NOT NULL,
	"base" text DEFAULT 'EUR' NOT NULL,
	"quote" text DEFAULT 'MKD' NOT NULL,
	"effective_on" date NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"approval_ref" text NOT NULL,
	CONSTRAINT "exchange_rate_check_windows_scope_uq" UNIQUE("tenant_id","book_id","id"),
	CONSTRAINT "exchange_rate_check_windows_bounds" CHECK (isfinite("exchange_rate_check_windows"."opens_at") and isfinite("exchange_rate_check_windows"."deadline_at")
        and "exchange_rate_check_windows"."opens_at" < "exchange_rate_check_windows"."deadline_at"
        and "exchange_rate_check_windows"."effective_on" = ("exchange_rate_check_windows"."opens_at" at time zone 'Europe/Skopje')::date),
	CONSTRAINT "exchange_rate_check_windows_approval_ref" CHECK ("exchange_rate_check_windows"."approval_ref" collate "C" ~ '^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$')
);
--> statement-breakpoint
ALTER TABLE "exchange_rate_check_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ADD COLUMN "check_id" text;--> statement-breakpoint
ALTER TABLE "exchange_rate_check_events" ADD CONSTRAINT "exchange_rate_check_events_window_fk" FOREIGN KEY ("tenant_id","book_id","window_id") REFERENCES "public"."exchange_rate_check_windows"("tenant_id","book_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_check_events" ADD CONSTRAINT "exchange_rate_check_events_start_fk" FOREIGN KEY ("tenant_id","book_id","window_id","check_id") REFERENCES "public"."exchange_rate_check_events"("tenant_id","book_id","window_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_check_events" ADD CONSTRAINT "exchange_rate_check_events_actor_fk" FOREIGN KEY ("tenant_id","actor_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_check_events" ADD CONSTRAINT "exchange_rate_check_events_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_check_events" ADD CONSTRAINT "exchange_rate_check_events_rate_fk" FOREIGN KEY ("tenant_id","rate_id","book_id","rate_effective_on") REFERENCES "public"."exchange_rates"("tenant_id","id","book_id","effective_on") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_check_windows" ADD CONSTRAINT "exchange_rate_check_windows_book_fk" FOREIGN KEY ("tenant_id","book_id","base","quote") REFERENCES "public"."exchange_rate_books"("tenant_id","id","base","quote") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_rate_check_events_dispute_idx" ON "exchange_rate_check_events" USING btree ("tenant_id","book_id","rate_id","occurred_at") WHERE "exchange_rate_check_events"."kind" = 'mismatch';--> statement-breakpoint
CREATE INDEX "exchange_rate_check_windows_open_idx" ON "exchange_rate_check_windows" USING btree ("tenant_id","book_id","opens_at");--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ADD CONSTRAINT "exchange_rate_verifications_check_fk" FOREIGN KEY ("tenant_id","book_id","check_id","legal_entity_id","verified_by","rate_id") REFERENCES "public"."exchange_rate_check_events"("tenant_id","book_id","id","legal_entity_id","actor_id","rate_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_tenant_book_date_revision_uq" UNIQUE("tenant_id","book_id","effective_on","revision");--> statement-breakpoint
ALTER TABLE "exchange_rate_verifications" ADD CONSTRAINT "exchange_rate_verifications_check_uq" UNIQUE("tenant_id","book_id","check_id");--> statement-breakpoint
CREATE POLICY "exchange_rate_check_events_tenant_policy" ON "exchange_rate_check_events" AS PERMISSIVE FOR ALL TO public USING ("exchange_rate_check_events"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("exchange_rate_check_events"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "exchange_rate_check_windows_tenant_policy" ON "exchange_rate_check_windows" AS PERMISSIVE FOR ALL TO public USING ("exchange_rate_check_windows"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("exchange_rate_check_windows"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);
--> statement-breakpoint
ALTER TABLE public.exchange_rate_check_windows FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.exchange_rate_check_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.exchange_rate_insert_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  iso_monday date;
  predecessor public.exchange_rates%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rates_read_committed_guard';
  END IF;

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
    IF NOT EXISTS (
      SELECT 1 FROM public.exchange_rates AS prior
      WHERE prior.tenant_id = NEW.tenant_id AND prior.book_id = NEW.book_id
        AND prior.id = NEW.corrects_rate_id AND prior.effective_on = NEW.effective_on
    ) THEN
      RAISE foreign_key_violation USING CONSTRAINT = 'exchange_rates_correction_fk';
    END IF;
    SELECT r.* INTO predecessor
    FROM public.exchange_rates AS r
    WHERE r.tenant_id = NEW.tenant_id AND r.book_id = NEW.book_id
      AND r.effective_on = NEW.effective_on
    ORDER BY r.revision DESC LIMIT 1;
    IF NEW.corrects_rate_id IS DISTINCT FROM predecessor.id
       OR NEW.revision IS DISTINCT FROM predecessor.revision + 1 THEN
      RAISE check_violation USING CONSTRAINT = 'exchange_rates_correction_current_guard',
        MESSAGE = 'Exchange rate correction must revise the current rate';
    END IF;
  END IF;

  NEW.stored_at := clock_timestamp();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_head_at(p_tenant text, p_book text, p_at timestamptz)
RETURNS TABLE(id text, rate numeric, effective_on date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT r.id, r.rate, r.effective_on FROM public.exchange_rates AS r
  WHERE r.tenant_id = p_tenant AND r.book_id = p_book
    AND r.stored_at <= p_at AND r.effective_on <= (p_at AT TIME ZONE 'Europe/Skopje')::date
  ORDER BY r.effective_on DESC, r.revision DESC
  LIMIT 1
$$;
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_check_windows_insert_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_windows_read_committed';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM current_setting('app.current_tenant_id', true)
     OR NEW.tenant_id IS DISTINCT FROM current_setting('app.current_access_tenant_id', true) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Rate check window requires bound tenant';
  END IF;
  PERFORM 1 FROM public.exchange_rate_books AS book
  WHERE book.tenant_id = NEW.tenant_id AND book.id = NEW.book_id
    AND book.base = NEW.base AND book.quote = NEW.quote
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE foreign_key_violation USING CONSTRAINT = 'exchange_rate_check_windows_book_fk';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exchange_rate_check_windows AS w
    WHERE w.tenant_id = NEW.tenant_id AND w.book_id = NEW.book_id
      AND w.opens_at < NEW.deadline_at AND NEW.opens_at < w.deadline_at
  ) THEN
    RAISE exclusion_violation USING CONSTRAINT = 'exchange_rate_check_windows_no_overlap';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_check_completed(p_tenant text, p_book text, p_check text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.exchange_rate_check_events AS event
    WHERE event.tenant_id = p_tenant AND event.book_id = p_book AND event.check_id = p_check
  ) OR EXISTS (
    SELECT 1 FROM public.exchange_rate_verifications AS v
    WHERE v.tenant_id = p_tenant AND v.book_id = p_book AND v.check_id = p_check
  )
$$;
--> statement-breakpoint
CREATE FUNCTION public.exchange_rate_check_events_insert_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  last_start public.exchange_rate_check_events%ROWTYPE;
  active_window public.exchange_rate_check_windows%ROWTYPE;
  head public.exchange_rates%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_events_read_committed';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM current_setting('app.current_tenant_id', true)
     OR NEW.tenant_id IS DISTINCT FROM current_setting('app.current_access_tenant_id', true) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Rate check event requires bound tenant';
  END IF;
  PERFORM 1 FROM public.exchange_rate_books AS book
  WHERE book.tenant_id = NEW.tenant_id AND book.id = NEW.book_id
    AND book.base = 'EUR' AND book.quote = 'MKD'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE foreign_key_violation USING CONSTRAINT = 'exchange_rate_check_events_window_fk';
  END IF;

  PERFORM 1 FROM public.legal_entities AS entity
  WHERE entity.tenant_id = NEW.tenant_id AND entity.id = NEW.legal_entity_id AND entity.is_active
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_events_active_entity';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.exchange_rate_verifications AS v
    WHERE v.tenant_id = NEW.tenant_id AND v.book_id = NEW.book_id
      AND v.operation_key = NEW.operation_key
  ) THEN
    RAISE unique_violation USING CONSTRAINT = 'exchange_rate_check_operation_guard';
  END IF;

  NEW.occurred_at := clock_timestamp();
  SELECT event.* INTO last_start FROM public.exchange_rate_check_events AS event
  WHERE event.tenant_id = NEW.tenant_id AND event.book_id = NEW.book_id AND event.kind = 'start'
  ORDER BY event.start_order DESC LIMIT 1;

  IF NEW.kind = 'start' OR NEW.kind = 'mismatch' THEN
    SELECT w.* INTO active_window FROM public.exchange_rate_check_windows AS w
    WHERE w.tenant_id = NEW.tenant_id AND w.book_id = NEW.book_id
      AND w.opens_at <= NEW.occurred_at AND NEW.occurred_at < w.deadline_at
      AND w.effective_on = (NEW.occurred_at AT TIME ZONE 'Europe/Skopje')::date;
    IF active_window.id IS NULL THEN
      RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_window_closed';
    END IF;
    SELECT h.* INTO head.id, head.rate, head.effective_on
    FROM public.exchange_rate_head_at(NEW.tenant_id, NEW.book_id, NEW.occurred_at) AS h
    WHERE h.effective_on = active_window.effective_on;
  END IF;

  IF NEW.kind = 'start' THEN
    IF last_start.id IS NOT NULL
       AND NOT public.exchange_rate_check_completed(NEW.tenant_id, NEW.book_id, last_start.id) THEN
      RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_pending';
    END IF;
    IF NEW.window_id IS NOT NULL AND NEW.window_id IS DISTINCT FROM active_window.id THEN
      RAISE foreign_key_violation USING CONSTRAINT = 'exchange_rate_check_events_window_fk';
    END IF;
    NEW.window_id := active_window.id;
    NEW.rate_id := head.id;
    NEW.rate_effective_on := head.effective_on;
    NEW.start_order := coalesce(last_start.start_order, 0) + 1;
    RETURN NEW;
  END IF;

  IF NEW.check_id IS DISTINCT FROM last_start.id OR last_start.id IS NULL
     OR NEW.occurred_at < last_start.occurred_at THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_current_start';
  END IF;
  IF public.exchange_rate_check_completed(NEW.tenant_id, NEW.book_id, last_start.id) THEN
    RAISE unique_violation USING CONSTRAINT = 'exchange_rate_check_terminal_guard';
  END IF;
  IF NEW.window_id IS DISTINCT FROM last_start.window_id THEN
    RAISE foreign_key_violation USING CONSTRAINT = 'exchange_rate_check_events_start_fk';
  END IF;
  IF NEW.legal_entity_id IS DISTINCT FROM last_start.legal_entity_id
     OR NEW.rate_id IS DISTINCT FROM last_start.rate_id
     OR NEW.rate_effective_on IS DISTINCT FROM last_start.rate_effective_on THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_outcome_scope';
  END IF;
  IF NEW.kind = 'mismatch' AND (
    NEW.actor_id IS DISTINCT FROM last_start.actor_id
    OR last_start.window_id IS DISTINCT FROM active_window.id
    OR head.id IS NULL OR NEW.rate_id IS DISTINCT FROM head.id
    OR NEW.observed_rate = head.rate
  ) THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_mismatch_guard';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.exchange_rate_verifications_insert_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  head public.exchange_rates%ROWTYPE;
  last_start public.exchange_rate_check_events%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_read_committed_guard';
  END IF;
  IF NEW.tenant_id IS DISTINCT FROM current_setting('app.current_tenant_id', true)
     OR NEW.tenant_id IS DISTINCT FROM current_setting('app.current_access_tenant_id', true) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Rate verification requires bound tenant';
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

  IF EXISTS (
    SELECT 1 FROM public.exchange_rate_check_events AS event
    WHERE event.tenant_id = NEW.tenant_id AND event.book_id = NEW.book_id
      AND event.operation_key = NEW.operation_key
  ) THEN
    RAISE unique_violation USING CONSTRAINT = 'exchange_rate_check_operation_guard';
  END IF;

  NEW.verified_at := clock_timestamp();
  SELECT h.* INTO head.id, head.rate, head.effective_on
  FROM public.exchange_rate_head_at(NEW.tenant_id, NEW.book_id, NEW.verified_at) AS h;
  IF head.id IS NULL OR head.id IS DISTINCT FROM NEW.rate_id THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_current_rate';
  END IF;
  -- Expand preserves the old writer. Only linked evidence can admit a sale.
  IF NEW.check_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF head.effective_on <> (NEW.verified_at AT TIME ZONE 'Europe/Skopje')::date THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_current_rate';
  END IF;

  SELECT event.* INTO last_start FROM public.exchange_rate_check_events AS event
  WHERE event.tenant_id = NEW.tenant_id AND event.book_id = NEW.book_id AND event.kind = 'start'
  ORDER BY event.start_order DESC LIMIT 1;
  IF last_start.id IS DISTINCT FROM NEW.check_id OR NEW.verified_at < last_start.occurred_at THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_current_start';
  END IF;
  IF public.exchange_rate_check_completed(NEW.tenant_id, NEW.book_id, NEW.check_id) THEN
    RAISE unique_violation USING CONSTRAINT = 'exchange_rate_check_terminal_guard';
  END IF;
  IF last_start.rate_id IS DISTINCT FROM NEW.rate_id
     OR last_start.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
     OR last_start.actor_id IS DISTINCT FROM NEW.verified_by THEN
    RAISE foreign_key_violation USING CONSTRAINT = 'exchange_rate_verifications_check_fk';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.exchange_rate_check_windows AS w
    WHERE w.tenant_id = NEW.tenant_id AND w.book_id = NEW.book_id AND w.id = last_start.window_id
      AND w.effective_on = head.effective_on
      AND w.opens_at <= NEW.verified_at AND NEW.verified_at < w.deadline_at
  ) THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_check_window_closed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.exchange_rate_check_events AS event
    WHERE event.tenant_id = NEW.tenant_id AND event.book_id = NEW.book_id
      AND event.rate_id = NEW.rate_id AND event.kind = 'mismatch'
  ) THEN
    RAISE check_violation USING CONSTRAINT = 'exchange_rate_verifications_disputed_rate';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION public.membership_sale_rate_at(p_tenant text, p_book text, p_at timestamptz DEFAULT statement_timestamp())
RETURNS TABLE(rate_id text, ready boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT head.id, head.effective_on = (p_at AT TIME ZONE 'Europe/Skopje')::date AND EXISTS (
    SELECT 1 FROM public.exchange_rate_check_windows AS w
    JOIN LATERAL (
      -- Choose the committed start by order. A backward clock step cannot hide it.
      SELECT event.id, event.window_id, event.rate_id, event.occurred_at
      FROM public.exchange_rate_check_events AS event
      WHERE event.tenant_id = p_tenant AND event.book_id = p_book AND event.kind = 'start'
      ORDER BY event.start_order DESC LIMIT 1
    ) AS last_start ON last_start.window_id = w.id AND last_start.rate_id = head.id
    JOIN public.exchange_rate_verifications AS v
      ON v.tenant_id = p_tenant AND v.book_id = p_book
      AND v.check_id = last_start.id AND v.rate_id = head.id
    JOIN public.exchange_rate_verification_limits AS policy ON policy.tenant_id = p_tenant
    WHERE w.tenant_id = p_tenant AND w.book_id = p_book AND w.effective_on = head.effective_on
      AND w.opens_at <= p_at AND p_at < w.deadline_at
      AND last_start.occurred_at <= p_at
      AND v.verified_at <= p_at
      AND extract(epoch FROM (p_at - v.verified_at)) <= policy.max_age_seconds
      AND NOT EXISTS (
        SELECT 1 FROM public.exchange_rate_check_events AS dispute
        WHERE dispute.tenant_id = p_tenant AND dispute.book_id = p_book
          AND dispute.rate_id = head.id AND dispute.kind = 'mismatch'
      )
  )
  FROM public.exchange_rate_books AS book
  CROSS JOIN LATERAL public.exchange_rate_head_at(p_tenant, p_book, p_at) AS head
  WHERE book.tenant_id = p_tenant AND book.id = p_book AND book.base = 'EUR' AND book.quote = 'MKD'
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.membership_sale_rate_verification_age_fn()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- The individual insert guard already holds the book lock and stamped the sale.
  PERFORM 1 FROM public.membership_sale_rate_at(NEW.tenant_id, NEW.rate_book_id, NEW.sold_at) AS rate
  WHERE rate.rate_id = NEW.rate_id AND rate.ready;
  IF NOT FOUND THEN
    RAISE check_violation USING CONSTRAINT = 'membership_sales_stale_rate';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exchange_rate_check_windows_insert_guard
BEFORE INSERT ON public.exchange_rate_check_windows
FOR EACH ROW EXECUTE FUNCTION public.exchange_rate_check_windows_insert_fn();
--> statement-breakpoint
CREATE TRIGGER exchange_rate_check_windows_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.exchange_rate_check_windows
FOR EACH STATEMENT EXECUTE FUNCTION public.exchange_rate_reject_mutation_fn();
--> statement-breakpoint
CREATE TRIGGER exchange_rate_check_events_insert_guard
BEFORE INSERT ON public.exchange_rate_check_events
FOR EACH ROW EXECUTE FUNCTION public.exchange_rate_check_events_insert_fn();
--> statement-breakpoint
CREATE TRIGGER exchange_rate_check_events_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.exchange_rate_check_events
FOR EACH STATEMENT EXECUTE FUNCTION public.exchange_rate_reject_mutation_fn();
--> statement-breakpoint
REVOKE ALL ON public.exchange_rate_check_windows, public.exchange_rate_check_events FROM PUBLIC;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    REVOKE ALL ON public.exchange_rate_check_windows, public.exchange_rate_check_events
      FROM interdomestik_runtime_rls;
    GRANT SELECT ON public.exchange_rate_check_windows TO interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.exchange_rate_check_events TO interdomestik_runtime_rls;
  END IF;
END;
$$;
