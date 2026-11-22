CREATE UNIQUE INDEX "claim_messages_tenant_claim_id_uq" ON "claim_messages" USING btree ("tenant_id","claim_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_tenant_id_id_uq" ON "claim" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE TABLE "claim_response_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_message_id" text,
	"requested_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"answered_by" text,
	"answer_kind" text,
	"answer_message_id" text,
	CONSTRAINT "claim_response_requests_kind_check" CHECK ("claim_response_requests"."kind" in ('claim_submitted', 'member_message')),
	CONSTRAINT "claim_response_requests_source_check" CHECK (("claim_response_requests"."kind" = 'member_message') = ("claim_response_requests"."source_message_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "claim_response_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"channel" text NOT NULL,
	"recipient_user_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"subject_message_id" text,
	"push_subscription_id" text,
	"facts" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terminal_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_detail" text,
	"skip_reason" text,
	"locale" text,
	"avoid_transport" text,
	"transport" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_deliveries_kind_check" CHECK ("notification_deliveries"."kind" in ('claim_submitted', 'claim_status_changed', 'claim_recovery_decision', 'claim_message_to_member', 'staff_claim_submitted', 'staff_member_message')),
	CONSTRAINT "notification_deliveries_channel_check" CHECK ("notification_deliveries"."channel" in ('email', 'push')),
	CONSTRAINT "notification_deliveries_subscription_check" CHECK (("notification_deliveries"."channel" = 'push') = ("notification_deliveries"."push_subscription_id" is not null)),
	CONSTRAINT "notification_deliveries_facts_check" CHECK (jsonb_typeof("notification_deliveries"."facts") = 'object'),
	CONSTRAINT "notification_deliveries_state_check" CHECK ("notification_deliveries"."state" in ('queued', 'claimed', 'sent', 'skipped', 'failed')),
	CONSTRAINT "notification_deliveries_lease_check" CHECK (("notification_deliveries"."state" = 'claimed') = ("notification_deliveries"."lease_until" is not null)),
	CONSTRAINT "notification_deliveries_attempts_check" CHECK ("notification_deliveries"."attempts" between 0 and 8),
	CONSTRAINT "notification_deliveries_terminal_check" CHECK (("notification_deliveries"."state" in ('sent', 'skipped', 'failed')) = ("notification_deliveries"."terminal_at" is not null)),
	CONSTRAINT "notification_deliveries_error_code_check" CHECK ("notification_deliveries"."last_error_code" ~ '^[a-z][a-z0-9_]{0,63}$'),
	CONSTRAINT "notification_deliveries_error_detail_check" CHECK (char_length("notification_deliveries"."last_error_detail") <= 300),
	CONSTRAINT "notification_deliveries_skip_check" CHECK ("notification_deliveries"."skip_reason" in ('recipient_missing', 'recipient_out_of_scope', 'email_unverified', 'email_suppressed', 'push_disabled', 'subscription_gone', 'claim_gone', 'stale')),
	CONSTRAINT "notification_deliveries_locale_check" CHECK ("notification_deliveries"."locale" in ('sq', 'en', 'sr', 'mk', 'de')),
	CONSTRAINT "notification_deliveries_transport_check" CHECK ("notification_deliveries"."transport" in ('smtp', 'resend', 'webpush')),
	CONSTRAINT "notification_deliveries_avoid_check" CHECK ("notification_deliveries"."avoid_transport" in ('smtp', 'resend'))
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "preferred_locale" text;--> statement-breakpoint
ALTER TABLE "support_handoffs" ADD COLUMN "first_public_response_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claim_response_requests" ADD CONSTRAINT "claim_response_requests_answered_by_user_id_fk" FOREIGN KEY ("answered_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_response_requests" ADD CONSTRAINT "claim_response_requests_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_response_requests" ADD CONSTRAINT "claim_response_requests_source_fk" FOREIGN KEY ("tenant_id","claim_id","source_message_id") REFERENCES "public"."claim_messages"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_response_requests" ADD CONSTRAINT "claim_response_requests_answer_fk" FOREIGN KEY ("tenant_id","claim_id","answer_message_id") REFERENCES "public"."claim_messages"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_fk" FOREIGN KEY ("tenant_id","recipient_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_claim_fk" FOREIGN KEY ("tenant_id","claim_id") REFERENCES "public"."claim"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_message_fk" FOREIGN KEY ("tenant_id","claim_id","subject_message_id") REFERENCES "public"."claim_messages"("tenant_id","claim_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claim_response_requests_source_uq" ON "claim_response_requests" USING btree ("tenant_id","kind",coalesce("source_message_id", "claim_id"));--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_tenant_id_uq" ON "notification_deliveries" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_deliveries_key_uq" ON "notification_deliveries" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_deliveries_due_idx" ON "notification_deliveries" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_idx" ON "notification_deliveries" USING btree ("tenant_id","state","created_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_preferred_locale_check" CHECK ("user"."preferred_locale" in ('sq', 'en', 'sr', 'mk', 'de'));--> statement-breakpoint
CREATE POLICY "claim_response_requests_tenant_policy" ON "claim_response_requests" AS PERMISSIVE FOR ALL TO public USING ("claim_response_requests"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("claim_response_requests"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);--> statement-breakpoint
CREATE POLICY "notification_deliveries_tenant_policy" ON "notification_deliveries" AS PERMISSIVE FOR ALL TO public USING ("notification_deliveries"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text) WITH CHECK ("notification_deliveries"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))::text);
--> statement-breakpoint
UPDATE public.support_handoffs
SET first_public_response_at = public_response_at AT TIME ZONE 'UTC'
WHERE public_response_version = 1;
--> statement-breakpoint
ALTER TABLE public.notification_deliveries FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.claim_response_requests FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON public.notification_deliveries, public.claim_response_requests FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
  runtime_role constant text := 'interdomestik_runtime_rls';
  lock_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    REVOKE ALL ON public.notification_deliveries, public.claim_response_requests
      FROM interdomestik_runtime_rls;
    GRANT SELECT, INSERT, UPDATE ON public.notification_deliveries TO interdomestik_runtime_rls;
    GRANT SELECT, INSERT ON public.claim_response_requests TO interdomestik_runtime_rls;
    GRANT UPDATE (answered_at, answered_by, answer_kind, answer_message_id)
      ON public.claim_response_requests TO interdomestik_runtime_rls;

    FOREACH lock_table IN ARRAY ARRAY[
      'claim', 'user', 'claim_escalation_agreements', 'subscriptions', 'membership_plans',
      'sponsor_terms', 'sponsor_roster_entries', 'claim_recovery_no_fee_evidence',
      'claim_transition_evidence', 'claim_messages'
    ] LOOP
      IF NOT (
        has_table_privilege(runtime_role, format('public.%I', lock_table), 'UPDATE')
        OR has_any_column_privilege(runtime_role, format('public.%I', lock_table), 'UPDATE')
      ) THEN
        RAISE EXCEPTION 'WP-11 requires UPDATE privilege for row locking on public.%', lock_table;
      END IF;
    END LOOP;
  END IF;
END;
$$;
