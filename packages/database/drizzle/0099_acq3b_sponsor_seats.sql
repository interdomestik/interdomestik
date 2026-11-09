-- ACQ-3b: tenant-consistent keys on existing tables, required by the composite FKs below.
CREATE UNIQUE INDEX "member_leads_tenant_id_id_branch_uq" ON "member_leads" USING btree ("tenant_id","id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plans_tenant_id_id_uq" ON "membership_plans" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_tenant_id_id_user_uq" ON "subscriptions" USING btree ("tenant_id","id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_entities_tenant_id_id_uq" ON "legal_entities" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE TABLE "sponsor_revision_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"decision" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invoice_reference" text,
	CONSTRAINT "sponsor_revision_decisions_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_revision_decisions_decision_check" CHECK ("sponsor_revision_decisions"."decision" in ('approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "sponsor_revision_decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_term_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"term_id" text NOT NULL,
	"revision" integer NOT NULL,
	"seat_count" integer NOT NULL,
	"price_per_seat_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"contract_reference" text NOT NULL,
	"terms_version" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_term_revisions_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_term_revisions_revision_check" CHECK ("sponsor_term_revisions"."revision" > 0),
	CONSTRAINT "sponsor_term_revisions_seat_count_check" CHECK ("sponsor_term_revisions"."seat_count" between 1 and 500),
	CONSTRAINT "sponsor_term_revisions_price_check" CHECK ("sponsor_term_revisions"."price_per_seat_minor" >= 0),
	CONSTRAINT "sponsor_term_revisions_currency_check" CHECK ("sponsor_term_revisions"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "sponsor_term_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"sponsor_id" text NOT NULL,
	"term_start" timestamp with time zone NOT NULL,
	"term_end" timestamp with time zone NOT NULL,
	"legal_entity_id" text NOT NULL,
	"plan_key" text NOT NULL,
	"plan_id" text NOT NULL,
	"terminated_effective_at" timestamp with time zone,
	"terminated_by" text,
	"terminated_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_terms_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_terms_window_check" CHECK ("sponsor_terms"."term_end" > "sponsor_terms"."term_start"),
	CONSTRAINT "sponsor_terms_termination_check" CHECK (("sponsor_terms"."terminated_effective_at" is null and "sponsor_terms"."terminated_by" is null and "sponsor_terms"."terminated_at" is null)
        or ("sponsor_terms"."terminated_effective_at" is not null and "sponsor_terms"."terminated_by" is not null and "sponsor_terms"."terminated_at" is not null
          and "sponsor_terms"."terminated_effective_at" between "sponsor_terms"."term_start" and "sponsor_terms"."term_end"))
);
--> statement-breakpoint
ALTER TABLE "sponsor_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"source_lead_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"registration_number" text,
	"tax_number" text,
	"billing_contact_name" text NOT NULL,
	"billing_contact_email" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsors_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsors_legal_name_check" CHECK (length(btrim("sponsors"."legal_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "sponsors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_handover_cancel_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"intent_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"dispatched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"authorizing_entry_id" text NOT NULL,
	"authorizing_term_id" text NOT NULL,
	"authorizing_term_start" timestamp with time zone NOT NULL,
	"authorizing_end" timestamp with time zone NOT NULL,
	"boundary_at" timestamp with time zone NOT NULL,
	"outcome" text DEFAULT 'unknown' NOT NULL,
	"evidence_ref" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "sponsor_handover_cancel_attempts_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_handover_cancel_attempts_no_check" CHECK ("sponsor_handover_cancel_attempts"."attempt_no" > 0),
	CONSTRAINT "sponsor_handover_cancel_attempts_boundary_check" CHECK ("sponsor_handover_cancel_attempts"."authorizing_term_start" <= "sponsor_handover_cancel_attempts"."boundary_at" and "sponsor_handover_cancel_attempts"."boundary_at" < "sponsor_handover_cancel_attempts"."authorizing_end"),
	CONSTRAINT "sponsor_handover_cancel_attempts_outcome_check" CHECK (("sponsor_handover_cancel_attempts"."outcome" = 'unknown') = ("sponsor_handover_cancel_attempts"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "sponsor_handover_cancel_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_handover_charges" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"intent_id" text NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"billing_period_starts_at" timestamp with time zone NOT NULL,
	"found_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staff_task_id" text,
	CONSTRAINT "sponsor_handover_charges_tenant_id_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "sponsor_handover_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_handover_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"provider_subscription_id" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"staff_disposition" text,
	"staff_evidence_id" text,
	"restoration_cutoff" timestamp with time zone,
	"cancel_dispatched_at" timestamp with time zone,
	"dispatch_period_ends_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"paid_until" timestamp with time zone,
	"paid_until_evidence" text,
	"canceled_confirmed_at" timestamp with time zone,
	"reconciled_through" timestamp with time zone,
	"reconciliation_closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_handover_intents_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_handover_intents_tenant_id_id_user_uq" UNIQUE("tenant_id","id","user_id"),
	CONSTRAINT "sponsor_handover_intents_dispatch_check" CHECK (("sponsor_handover_intents"."cancel_dispatched_at" is null) = ("sponsor_handover_intents"."dispatch_period_ends_at" is null)),
	CONSTRAINT "sponsor_handover_intents_paid_until_check" CHECK (("sponsor_handover_intents"."paid_until" is null) = ("sponsor_handover_intents"."paid_until_evidence" is null)),
	CONSTRAINT "sponsor_handover_intents_staff_closure_check" CHECK (("sponsor_handover_intents"."state" = 'closed_by_staff') = ("sponsor_handover_intents"."staff_disposition" is not null)
        and ("sponsor_handover_intents"."staff_disposition" is null) = ("sponsor_handover_intents"."staff_evidence_id" is null)
        and ("sponsor_handover_intents"."restoration_cutoff" is null or "sponsor_handover_intents"."staff_disposition" = 'renewing_as_member')),
	CONSTRAINT "sponsor_handover_intents_void_check" CHECK ("sponsor_handover_intents"."state" <> 'void' or "sponsor_handover_intents"."cancel_dispatched_at" is null)
);
--> statement-breakpoint
ALTER TABLE "sponsor_handover_intents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_mail_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"roster_entry_id" text,
	"handover_intent_id" text,
	"user_id" text,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terminal_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_mail_outbox_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_mail_outbox_target_check" CHECK (("sponsor_mail_outbox"."roster_entry_id" is not null and "sponsor_mail_outbox"."handover_intent_id" is null and "sponsor_mail_outbox"."user_id" is null)
        or ("sponsor_mail_outbox"."roster_entry_id" is null and "sponsor_mail_outbox"."handover_intent_id" is not null and "sponsor_mail_outbox"."user_id" is not null
          and "sponsor_mail_outbox"."kind" = 'membership_end_offer')),
	CONSTRAINT "sponsor_mail_outbox_terminal_check" CHECK (("sponsor_mail_outbox"."state" in ('sent', 'skipped', 'failed')) = ("sponsor_mail_outbox"."terminal_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "sponsor_mail_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_roster_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"term_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"email_normalized" text,
	"email_hmac" text,
	"user_id" text,
	"conflict_decision" text,
	"conflict_decided_at" timestamp with time zone,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_company_at" timestamp with time zone,
	"opted_out_at" timestamp with time zone,
	"starts_at" timestamp with time zone,
	"handover_intent_id" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"review_reason" text,
	"optout_token_hash" text,
	CONSTRAINT "sponsor_roster_entries_tenant_id_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "sponsor_roster_entries_tenant_id_id_user_uq" UNIQUE("tenant_id","id","user_id"),
	CONSTRAINT "sponsor_roster_entries_decision_check" CHECK (("sponsor_roster_entries"."conflict_decision" is null) = ("sponsor_roster_entries"."conflict_decided_at" is null)
        and ("sponsor_roster_entries"."conflict_decision" is null or "sponsor_roster_entries"."user_id" is not null)),
	CONSTRAINT "sponsor_roster_entries_revocation_check" CHECK (("sponsor_roster_entries"."revoked_at" is null) = ("sponsor_roster_entries"."revoked_reason" is null)),
	CONSTRAINT "sponsor_roster_entries_review_check" CHECK (("sponsor_roster_entries"."outcome" = 'staff_review') = ("sponsor_roster_entries"."review_reason" is not null)),
	CONSTRAINT "sponsor_roster_entries_intent_check" CHECK ("sponsor_roster_entries"."handover_intent_id" is null or "sponsor_roster_entries"."user_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "sponsor_roster_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_revision_decisions" ADD CONSTRAINT "sponsor_revision_decisions_revision_fk" FOREIGN KEY ("tenant_id","revision_id") REFERENCES "public"."sponsor_term_revisions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_revision_decisions" ADD CONSTRAINT "sponsor_revision_decisions_decided_by_fk" FOREIGN KEY ("tenant_id","decided_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_term_revisions" ADD CONSTRAINT "sponsor_term_revisions_term_fk" FOREIGN KEY ("tenant_id","term_id") REFERENCES "public"."sponsor_terms"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_term_revisions" ADD CONSTRAINT "sponsor_term_revisions_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_terms" ADD CONSTRAINT "sponsor_terms_sponsor_fk" FOREIGN KEY ("tenant_id","sponsor_id") REFERENCES "public"."sponsors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_terms" ADD CONSTRAINT "sponsor_terms_legal_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_terms" ADD CONSTRAINT "sponsor_terms_plan_fk" FOREIGN KEY ("tenant_id","plan_key") REFERENCES "public"."membership_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_terms" ADD CONSTRAINT "sponsor_terms_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_terms" ADD CONSTRAINT "sponsor_terms_terminated_by_fk" FOREIGN KEY ("tenant_id","terminated_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_branch_fk" FOREIGN KEY ("tenant_id","branch_id") REFERENCES "public"."branches"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_source_lead_fk" FOREIGN KEY ("tenant_id","source_lead_id","branch_id") REFERENCES "public"."member_leads"("tenant_id","id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_created_by_fk" FOREIGN KEY ("tenant_id","created_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_handover_cancel_attempts" ADD CONSTRAINT "sponsor_handover_cancel_attempts_intent_fk" FOREIGN KEY ("tenant_id","intent_id") REFERENCES "public"."sponsor_handover_intents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_handover_charges" ADD CONSTRAINT "sponsor_handover_charges_intent_fk" FOREIGN KEY ("tenant_id","intent_id") REFERENCES "public"."sponsor_handover_intents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_handover_intents" ADD CONSTRAINT "sponsor_handover_intents_subscription_fk" FOREIGN KEY ("tenant_id","subscription_id","user_id") REFERENCES "public"."subscriptions"("tenant_id","id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_mail_outbox" ADD CONSTRAINT "sponsor_mail_outbox_entry_fk" FOREIGN KEY ("tenant_id","roster_entry_id") REFERENCES "public"."sponsor_roster_entries"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_mail_outbox" ADD CONSTRAINT "sponsor_mail_outbox_intent_fk" FOREIGN KEY ("tenant_id","handover_intent_id","user_id") REFERENCES "public"."sponsor_handover_intents"("tenant_id","id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_roster_entries" ADD CONSTRAINT "sponsor_roster_entries_term_fk" FOREIGN KEY ("tenant_id","term_id") REFERENCES "public"."sponsor_terms"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_roster_entries" ADD CONSTRAINT "sponsor_roster_entries_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_roster_entries" ADD CONSTRAINT "sponsor_roster_entries_added_by_fk" FOREIGN KEY ("tenant_id","added_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_roster_entries" ADD CONSTRAINT "sponsor_roster_entries_intent_fk" FOREIGN KEY ("tenant_id","handover_intent_id","user_id") REFERENCES "public"."sponsor_handover_intents"("tenant_id","id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_revision_decisions_revision_uq" ON "sponsor_revision_decisions" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_term_revisions_term_revision_uq" ON "sponsor_term_revisions" USING btree ("term_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_terms_sponsor_start_uq" ON "sponsor_terms" USING btree ("sponsor_id","term_start");--> statement-breakpoint
CREATE INDEX "sponsor_terms_tenant_window_idx" ON "sponsor_terms" USING btree ("tenant_id","term_start","term_end");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsors_tenant_source_lead_uq" ON "sponsors" USING btree ("tenant_id","source_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_handover_cancel_attempts_intent_no_uq" ON "sponsor_handover_cancel_attempts" USING btree ("intent_id","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_handover_charges_transaction_uq" ON "sponsor_handover_charges" USING btree ("provider_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_handover_intents_provider_subscription_uq" ON "sponsor_handover_intents" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_handover_intents_paid_until_evidence_uq" ON "sponsor_handover_intents" USING btree ("paid_until_evidence");--> statement-breakpoint
CREATE INDEX "sponsor_handover_intents_due_idx" ON "sponsor_handover_intents" USING btree ("tenant_id","state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_mail_outbox_idempotency_uq" ON "sponsor_mail_outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "sponsor_mail_outbox_due_idx" ON "sponsor_mail_outbox" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_roster_entries_term_hmac_uq" ON "sponsor_roster_entries" USING btree ("term_id","email_hmac");--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_roster_entries_term_user_uq" ON "sponsor_roster_entries" USING btree ("term_id","user_id") WHERE "sponsor_roster_entries"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sponsor_roster_entries_optout_token_uq" ON "sponsor_roster_entries" USING btree ("optout_token_hash");--> statement-breakpoint
CREATE INDEX "sponsor_roster_entries_user_idx" ON "sponsor_roster_entries" USING btree ("tenant_id","user_id");--> statement-breakpoint
DO $$
DECLARE
  table_name text;
  tenant_expression text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'sponsor_revision_decisions',
    'sponsor_term_revisions',
    'sponsor_terms',
    'sponsors',
    'sponsor_handover_cancel_attempts',
    'sponsor_handover_charges',
    'sponsor_handover_intents',
    'sponsor_mail_outbox',
    'sponsor_roster_entries'
  ] LOOP
    tenant_expression := format('%I.%I = (select current_setting(%L, true))::text',
      table_name, 'tenant_id', 'app.current_access_tenant_id');
    EXECUTE format('CREATE POLICY %I ON %I AS PERMISSIVE FOR ALL TO public USING (%s) WITH CHECK (%s)',
      table_name || '_tenant_policy', table_name, tenant_expression, tenant_expression);
  END LOOP; END; $$;--> statement-breakpoint
-- ACQ-3b §3.2–§3.3 (hand-written): forced RLS, non-overlapping terms and immutability triggers.
ALTER TABLE "sponsors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- ACQ-3b §3.2–§3.3 (hand-written): forced RLS, non-overlapping terms and immutability triggers.
ALTER TABLE "sponsors" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_terms" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_term_revisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_revision_decisions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_handover_intents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_handover_cancel_attempts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_handover_charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_roster_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sponsor_mail_outbox" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "sponsor_terms" ADD CONSTRAINT "sponsor_terms_no_overlap"
  EXCLUDE USING gist ("sponsor_id" WITH =, tstzrange("term_start", "term_end", '[)') WITH &&);--> statement-breakpoint
CREATE OR REPLACE FUNCTION sponsor_reject_update_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE check_violation USING MESSAGE = format('%s: rows are immutable', TG_TABLE_NAME);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "sponsor_term_revisions_immutable" BEFORE UPDATE ON "sponsor_term_revisions"
FOR EACH ROW EXECUTE FUNCTION sponsor_reject_update_fn();--> statement-breakpoint
CREATE TRIGGER "sponsor_revision_decisions_immutable" BEFORE UPDATE ON "sponsor_revision_decisions"
FOR EACH ROW EXECUTE FUNCTION sponsor_reject_update_fn();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sponsor_terms_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.id, NEW.tenant_id, NEW.sponsor_id, NEW.term_start, NEW.term_end, NEW.legal_entity_id,
      NEW.plan_key, NEW.plan_id, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.sponsor_id, OLD.term_start, OLD.term_end, OLD.legal_entity_id,
      OLD.plan_key, OLD.plan_id, OLD.created_by, OLD.created_at)
     OR (OLD.terminated_effective_at IS NOT NULL
         AND (NEW.terminated_effective_at, NEW.terminated_by, NEW.terminated_at)
             IS DISTINCT FROM (OLD.terminated_effective_at, OLD.terminated_by, OLD.terminated_at)) THEN
    RAISE check_violation USING MESSAGE = 'sponsor_terms: only the termination columns may be set, once';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "sponsor_terms_guard" BEFORE UPDATE ON "sponsor_terms"
FOR EACH ROW EXECUTE FUNCTION sponsor_terms_guard_fn();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sponsor_handover_intents_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.id, NEW.tenant_id, NEW.user_id, NEW.subscription_id, NEW.provider_subscription_id,
      NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.user_id, OLD.subscription_id, OLD.provider_subscription_id,
      OLD.created_at)
     OR (OLD.staff_disposition IS NOT NULL AND NEW.staff_disposition IS DISTINCT FROM OLD.staff_disposition)
     OR (OLD.staff_evidence_id IS NOT NULL AND NEW.staff_evidence_id IS DISTINCT FROM OLD.staff_evidence_id)
     OR (OLD.restoration_cutoff IS NOT NULL AND NEW.restoration_cutoff IS DISTINCT FROM OLD.restoration_cutoff)
     OR (OLD.cancel_dispatched_at IS NOT NULL AND NEW.cancel_dispatched_at IS DISTINCT FROM OLD.cancel_dispatched_at)
     OR (OLD.dispatch_period_ends_at IS NOT NULL AND NEW.dispatch_period_ends_at IS DISTINCT FROM OLD.dispatch_period_ends_at)
     OR (OLD.paid_until IS NOT NULL AND NEW.paid_until IS DISTINCT FROM OLD.paid_until)
     OR (OLD.paid_until_evidence IS NOT NULL AND NEW.paid_until_evidence IS DISTINCT FROM OLD.paid_until_evidence)
     OR (OLD.canceled_confirmed_at IS NOT NULL AND NEW.canceled_confirmed_at IS DISTINCT FROM OLD.canceled_confirmed_at)
     OR (OLD.reconciliation_closed_at IS NOT NULL AND NEW.reconciliation_closed_at IS DISTINCT FROM OLD.reconciliation_closed_at)
     OR (OLD.state IN ('void', 'done', 'closed_by_staff') AND NEW.state <> OLD.state) THEN
    RAISE check_violation USING MESSAGE = 'sponsor_handover_intents: immutable, set-once or terminal column changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "sponsor_handover_intents_guard" BEFORE UPDATE ON "sponsor_handover_intents"
FOR EACH ROW EXECUTE FUNCTION sponsor_handover_intents_guard_fn();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sponsor_handover_cancel_attempts_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.id, NEW.tenant_id, NEW.intent_id, NEW.attempt_no, NEW.dispatched_at,
      NEW.authorizing_entry_id, NEW.authorizing_term_id, NEW.authorizing_term_start,
      NEW.authorizing_end, NEW.boundary_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.intent_id, OLD.attempt_no, OLD.dispatched_at,
      OLD.authorizing_entry_id, OLD.authorizing_term_id, OLD.authorizing_term_start,
      OLD.authorizing_end, OLD.boundary_at)
     OR OLD.resolved_at IS NOT NULL
     OR NEW.outcome = OLD.outcome THEN
    RAISE check_violation USING MESSAGE = 'sponsor_handover_cancel_attempts: only one move from unknown is allowed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "sponsor_handover_cancel_attempts_guard" BEFORE UPDATE ON "sponsor_handover_cancel_attempts"
FOR EACH ROW EXECUTE FUNCTION sponsor_handover_cancel_attempts_guard_fn();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sponsor_handover_charges_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.id, NEW.tenant_id, NEW.intent_id, NEW.provider_transaction_id,
      NEW.billing_period_starts_at, NEW.found_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.intent_id, OLD.provider_transaction_id,
      OLD.billing_period_starts_at, OLD.found_at)
     OR (OLD.staff_task_id IS NOT NULL AND NEW.staff_task_id IS DISTINCT FROM OLD.staff_task_id) THEN
    RAISE check_violation USING MESSAGE = 'sponsor_handover_charges: append-only';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "sponsor_handover_charges_guard" BEFORE UPDATE ON "sponsor_handover_charges"
FOR EACH ROW EXECUTE FUNCTION sponsor_handover_charges_guard_fn();--> statement-breakpoint
CREATE OR REPLACE FUNCTION sponsor_roster_entries_guard_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (NEW.id, NEW.tenant_id, NEW.term_id, NEW.added_by, NEW.added_at)
     IS DISTINCT FROM (OLD.id, OLD.tenant_id, OLD.term_id, OLD.added_by, OLD.added_at)
     -- set once from NULL
     OR (OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id)
     OR (OLD.conflict_decision IS NOT NULL AND NEW.conflict_decision IS DISTINCT FROM OLD.conflict_decision)
     OR (OLD.conflict_decided_at IS NOT NULL AND NEW.conflict_decided_at IS DISTINCT FROM OLD.conflict_decided_at)
     OR (OLD.starts_at IS NOT NULL AND NEW.starts_at IS DISTINCT FROM OLD.starts_at)
     OR (OLD.handover_intent_id IS NOT NULL AND NEW.handover_intent_id IS DISTINCT FROM OLD.handover_intent_id)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.revoked_reason IS NOT NULL AND NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason)
     OR (OLD.left_company_at IS NOT NULL AND NEW.left_company_at IS DISTINCT FROM OLD.left_company_at)
     OR (OLD.opted_out_at IS NOT NULL AND NEW.opted_out_at IS DISTINCT FROM OLD.opted_out_at)
     -- may only be cleared
     OR (NEW.optout_token_hash IS NOT NULL AND NEW.optout_token_hash IS DISTINCT FROM OLD.optout_token_hash)
     -- one-way retention erasure
     OR (NEW.first_name IS NOT NULL AND NEW.first_name IS DISTINCT FROM OLD.first_name)
     OR (NEW.last_name IS NOT NULL AND NEW.last_name IS DISTINCT FROM OLD.last_name)
     OR (NEW.email_normalized IS NOT NULL AND NEW.email_normalized IS DISTINCT FROM OLD.email_normalized)
     OR (NEW.email_hmac IS NOT NULL AND NEW.email_hmac IS DISTINCT FROM OLD.email_hmac) THEN
    RAISE check_violation USING MESSAGE = 'sponsor_roster_entries: immutable, set-once or erased column changed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "sponsor_roster_entries_guard" BEFORE UPDATE ON "sponsor_roster_entries"
FOR EACH ROW EXECUTE FUNCTION sponsor_roster_entries_guard_fn();
