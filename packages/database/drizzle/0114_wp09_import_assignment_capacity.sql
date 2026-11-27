-- The existing term identity pins the sponsor and legal entity used by a signed year.
CREATE UNIQUE INDEX "sponsor_terms_wp09_scope_uq"
  ON public.sponsor_terms (tenant_id, id, sponsor_id, legal_entity_id);
--> statement-breakpoint
CREATE TABLE "membership_import_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"staff_user_id" text NOT NULL,
	"capacity" text NOT NULL,
	"source_key" text,
	"sponsor_id" text,
	"approved_by" text NOT NULL,
	"evidence_ref" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	CONSTRAINT "membership_import_assignments_scope_ck" CHECK (num_nonnulls("membership_import_assignments"."source_key", "membership_import_assignments"."sponsor_id") = 1
        and ("membership_import_assignments"."source_key" is null or "membership_import_assignments"."source_key" ~ '[^[:space:]]')
        and "membership_import_assignments"."capacity" in ('import', 'decision')),
	CONSTRAINT "membership_import_assignments_separation_ck" CHECK ("membership_import_assignments"."approved_by" <> "membership_import_assignments"."staff_user_id"),
	CONSTRAINT "membership_import_assignments_validity_ck" CHECK (isfinite("membership_import_assignments"."valid_from") and isfinite("membership_import_assignments"."valid_until")
        and "membership_import_assignments"."valid_from" < "membership_import_assignments"."valid_until"),
	CONSTRAINT "membership_import_assignments_revocation_ck" CHECK (("membership_import_assignments"."revoked_at" is null) = ("membership_import_assignments"."revoked_by" is null)
        and ("membership_import_assignments"."revoked_at" is null or isfinite("membership_import_assignments"."revoked_at"))),
	CONSTRAINT "membership_import_assignments_evidence_ck" CHECK ("membership_import_assignments"."evidence_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
);
--> statement-breakpoint
ALTER TABLE "membership_import_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_contract_years" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"sponsor_id" text NOT NULL,
	"term_id" text NOT NULL,
	"agreement_key" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_before" date NOT NULL,
	"fee_model" text NOT NULL,
	"fee_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"benefits" jsonb NOT NULL,
	"signed_ceiling" integer NOT NULL,
	"current_limit" integer NOT NULL,
	"signed_evidence_ref" text NOT NULL,
	"verified_by" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sponsor_contract_years_term_uq" UNIQUE("tenant_id","term_id"),
	CONSTRAINT "sponsor_contract_years_scope_uq" UNIQUE("tenant_id","legal_entity_id","id"),
	CONSTRAINT "sponsor_contract_years_company_uq" UNIQUE("tenant_id","legal_entity_id","id","sponsor_id","term_id"),
	CONSTRAINT "sponsor_contract_years_agreement_uq" UNIQUE("tenant_id","legal_entity_id","id","agreement_key"),
	CONSTRAINT "sponsor_contract_years_limit_uq" UNIQUE("tenant_id","legal_entity_id","id","current_limit"),
	CONSTRAINT "sponsor_contract_years_limit_ck" CHECK (1 <= "sponsor_contract_years"."current_limit" and "sponsor_contract_years"."current_limit" <= "sponsor_contract_years"."signed_ceiling"
        and "sponsor_contract_years"."signed_ceiling" <= 500),
	CONSTRAINT "sponsor_contract_years_window_ck" CHECK (isfinite("sponsor_contract_years"."starts_on") and isfinite("sponsor_contract_years"."ends_before") and "sponsor_contract_years"."starts_on" < "sponsor_contract_years"."ends_before"),
	CONSTRAINT "sponsor_contract_years_fee_ck" CHECK ("sponsor_contract_years"."fee_model" in ('fixed_fee', 'per_seat') and "sponsor_contract_years"."fee_minor" >= 0 and "sponsor_contract_years"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "sponsor_contract_years_evidence_ck" CHECK ("sponsor_contract_years"."agreement_key" ~ '[^[:space:]]' and "sponsor_contract_years"."signed_evidence_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
        and jsonb_typeof("sponsor_contract_years"."benefits") = 'object' and isfinite("sponsor_contract_years"."verified_at"))
);
--> statement-breakpoint
ALTER TABLE "sponsor_contract_years" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_import_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"origin" text NOT NULL,
	"source_key" text,
	"sponsor_id" text,
	"term_id" text,
	"contract_year_id" text,
	"commercial_revision" integer,
	"upload_key" text NOT NULL,
	"upload_position" integer NOT NULL,
	"upload_anchor_position" integer DEFAULT 1 NOT NULL,
	"upload_list_count" integer NOT NULL,
	"upload_fingerprint" text NOT NULL,
	"template_version" text NOT NULL,
	"canonicalization_version" text NOT NULL,
	"digest" text NOT NULL,
	"row_count" integer NOT NULL,
	"submitted_by" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"verified_by" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"employer_approver_ref" text,
	"employer_approved_at" timestamp with time zone,
	"employer_approval_ref" text,
	"employer_approved_digest" text,
	"decision" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decided_digest" text,
	CONSTRAINT "membership_import_lists_origin_uq" UNIQUE("tenant_id","legal_entity_id","id","origin"),
	CONSTRAINT "membership_import_lists_year_uq" UNIQUE("tenant_id","legal_entity_id","id","contract_year_id"),
	CONSTRAINT "membership_import_lists_digest_uq" UNIQUE("tenant_id","digest"),
	CONSTRAINT "membership_import_lists_position_uq" UNIQUE("tenant_id","upload_key","upload_position"),
	CONSTRAINT "membership_import_lists_upload_claim_uq" UNIQUE("tenant_id","upload_key","upload_position","upload_fingerprint","upload_list_count"),
	CONSTRAINT "membership_import_lists_target_ck" CHECK (("membership_import_lists"."origin" = 'prior_paid_individual' and "membership_import_lists"."source_key" is not null
        and "membership_import_lists"."source_key" ~ '[^[:space:]]'
        and num_nonnulls("membership_import_lists"."sponsor_id", "membership_import_lists"."term_id", "membership_import_lists"."contract_year_id", "membership_import_lists"."commercial_revision") = 0)
        or ("membership_import_lists"."origin" in ('prior_paid_company', 'new_company') and "membership_import_lists"."source_key" is null
          and num_nonnulls("membership_import_lists"."sponsor_id", "membership_import_lists"."term_id", "membership_import_lists"."contract_year_id") = 3
          and ("membership_import_lists"."origin" <> 'new_company' or "membership_import_lists"."commercial_revision" is not null))),
	CONSTRAINT "membership_import_lists_upload_ck" CHECK ("membership_import_lists"."upload_key" ~ '[^[:space:]]' and "membership_import_lists"."upload_anchor_position" = 1
        and "membership_import_lists"."upload_position" between 1 and "membership_import_lists"."upload_list_count"
        and "membership_import_lists"."upload_fingerprint" ~ '^[0-9a-f]{64}$'
        and "membership_import_lists"."digest" ~ '^[0-9a-f]{64}$' and "membership_import_lists"."row_count" > 0
        and "membership_import_lists"."template_version" ~ '[^[:space:]]' and "membership_import_lists"."canonicalization_version" ~ '[^[:space:]]'),
	CONSTRAINT "membership_import_lists_verification_ck" CHECK (isfinite("membership_import_lists"."submitted_at") and isfinite("membership_import_lists"."verified_at")
        and "membership_import_lists"."verified_at" >= "membership_import_lists"."submitted_at"),
	CONSTRAINT "membership_import_lists_employer_approval_ck" CHECK (("membership_import_lists"."origin" <> 'new_company' and num_nonnulls("membership_import_lists"."employer_approver_ref",
        "membership_import_lists"."employer_approved_at", "membership_import_lists"."employer_approval_ref", "membership_import_lists"."employer_approved_digest") = 0)
        or (num_nonnulls("membership_import_lists"."employer_approver_ref", "membership_import_lists"."employer_approved_at",
          "membership_import_lists"."employer_approval_ref", "membership_import_lists"."employer_approved_digest") = 4
          and "membership_import_lists"."employer_approver_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
          and "membership_import_lists"."employer_approval_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
          and isfinite("membership_import_lists"."employer_approved_at") and "membership_import_lists"."employer_approved_at" <= "membership_import_lists"."verified_at"
          and "membership_import_lists"."employer_approved_digest" = "membership_import_lists"."digest")),
	CONSTRAINT "membership_import_lists_decision_ck" CHECK (num_nonnulls("membership_import_lists"."decision", "membership_import_lists"."decided_by", "membership_import_lists"."decided_at", "membership_import_lists"."decided_digest") = 0
        or (num_nonnulls("membership_import_lists"."decision", "membership_import_lists"."decided_by", "membership_import_lists"."decided_at", "membership_import_lists"."decided_digest") = 4
          and "membership_import_lists"."decision" in ('approved', 'rejected') and isfinite("membership_import_lists"."decided_at")
          and "membership_import_lists"."decided_at" >= "membership_import_lists"."verified_at" and "membership_import_lists"."decided_digest" = "membership_import_lists"."digest"
          and "membership_import_lists"."decided_by" <> "membership_import_lists"."submitted_by" and "membership_import_lists"."decided_by" <> "membership_import_lists"."verified_by"))
);
--> statement-breakpoint
ALTER TABLE "membership_import_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"list_id" text NOT NULL,
	"contract_year_id" text,
	"origin" text NOT NULL,
	"source_row" integer NOT NULL,
	"review_facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stable_identity_namespace" text,
	"stable_identity_key" text,
	"email_alias_key" text,
	"member_user_id" text,
	"member_verified_at" timestamp with time zone,
	"evidence_class" text,
	"evidence_ref" text,
	"source_paid_through" date,
	"fulfillment_state" text DEFAULT 'pending' NOT NULL,
	"period_origin_ref" text,
	"identity_released_at" timestamp with time zone,
	CONSTRAINT "membership_import_rows_scope_uq" UNIQUE("tenant_id","legal_entity_id","id"),
	CONSTRAINT "membership_import_rows_year_uq" UNIQUE("tenant_id","legal_entity_id","contract_year_id","id"),
	CONSTRAINT "membership_import_rows_position_uq" UNIQUE("tenant_id","list_id","source_row"),
	CONSTRAINT "membership_import_rows_origin_ck" CHECK (("membership_import_rows"."origin" = 'prior_paid_individual' and "membership_import_rows"."contract_year_id" is null)
        or ("membership_import_rows"."origin" in ('prior_paid_company', 'new_company') and "membership_import_rows"."contract_year_id" is not null)),
	CONSTRAINT "membership_import_rows_review_ck" CHECK ("membership_import_rows"."source_row" > 0 and "membership_import_rows"."review_facts" = '{}'::jsonb),
	CONSTRAINT "membership_import_rows_identity_ck" CHECK (num_nonnulls("membership_import_rows"."stable_identity_key", "membership_import_rows"."email_alias_key", "membership_import_rows"."member_user_id") >= 1
        and "membership_import_rows"."stable_identity_key" is null and "membership_import_rows"."stable_identity_namespace" is null
        and ("membership_import_rows"."email_alias_key" is null or "membership_import_rows"."email_alias_key" ~ '^[0-9a-f]{64}$')
        and ("membership_import_rows"."member_user_id" is null) = ("membership_import_rows"."member_verified_at" is null)
        and ("membership_import_rows"."member_verified_at" is null or isfinite("membership_import_rows"."member_verified_at"))),
	CONSTRAINT "membership_import_rows_proof_ck" CHECK (("membership_import_rows"."evidence_class" is null) = ("membership_import_rows"."evidence_ref" is null)
        and ("membership_import_rows"."evidence_ref" is null or
          ("membership_import_rows"."evidence_class" ~ '^[a-z][a-z0-9_-]{0,63}$' and "membership_import_rows"."evidence_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'))
        and ("membership_import_rows"."source_paid_through" is null or isfinite("membership_import_rows"."source_paid_through"))
        and ("membership_import_rows"."origin" = 'new_company'
          or ("membership_import_rows"."evidence_ref" is not null and "membership_import_rows"."source_paid_through" is not null))),
	CONSTRAINT "membership_import_rows_fulfillment_ck" CHECK ("membership_import_rows"."fulfillment_state" in ('pending', 'fulfilled', 'rejected', 'withdrawn', 'expired')
        and ("membership_import_rows"."fulfillment_state" = 'fulfilled') = ("membership_import_rows"."period_origin_ref" is not null)
        and ("membership_import_rows"."period_origin_ref" is null or "membership_import_rows"."period_origin_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$')
        and ("membership_import_rows"."identity_released_at" is null
          or ("membership_import_rows"."fulfillment_state" <> 'pending' and isfinite("membership_import_rows"."identity_released_at"))))
);
--> statement-breakpoint
ALTER TABLE "membership_import_rows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_contract_year_seats" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"contract_year_id" text NOT NULL,
	"import_row_id" text NOT NULL,
	"slot" integer NOT NULL,
	"year_current_limit" integer NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_contract_year_seats_slot_uq" UNIQUE("tenant_id","contract_year_id","slot"),
	CONSTRAINT "sponsor_contract_year_seats_row_uq" UNIQUE("tenant_id","import_row_id"),
	CONSTRAINT "sponsor_contract_year_seats_scope_uq" UNIQUE("tenant_id","legal_entity_id","contract_year_id","id"),
	CONSTRAINT "sponsor_contract_year_seats_subject_uq" UNIQUE("tenant_id","legal_entity_id","contract_year_id","id","import_row_id"),
	CONSTRAINT "sponsor_contract_year_seats_slot_ck" CHECK ("sponsor_contract_year_seats"."slot" between 1 and "sponsor_contract_year_seats"."year_current_limit" and isfinite("sponsor_contract_year_seats"."reserved_at"))
);
--> statement-breakpoint
ALTER TABLE "sponsor_contract_year_seats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sponsor_exit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"contract_year_id" text NOT NULL,
	"agreement_key" text NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"employee_seat_id" text,
	"recorded_by" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"evidence_ref" text NOT NULL,
	CONSTRAINT "sponsor_exit_events_operation_uq" UNIQUE("tenant_id","operation_id"),
	CONSTRAINT "sponsor_exit_events_scope_uq" UNIQUE("tenant_id","legal_entity_id","contract_year_id","id","kind"),
	CONSTRAINT "sponsor_exit_events_employee_uq" UNIQUE("tenant_id","legal_entity_id","contract_year_id","id","employee_seat_id"),
	CONSTRAINT "sponsor_exit_events_target_ck" CHECK (("sponsor_exit_events"."kind" = 'agreement_termination' and "sponsor_exit_events"."employee_seat_id" is null)
        or ("sponsor_exit_events"."kind" = 'employee_departure' and "sponsor_exit_events"."employee_seat_id" is not null)),
	CONSTRAINT "sponsor_exit_events_evidence_ck" CHECK ("sponsor_exit_events"."operation_id" ~ '[^[:space:]]' and "sponsor_exit_events"."evidence_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
        and isfinite("sponsor_exit_events"."recorded_at") and isfinite("sponsor_exit_events"."effective_at"))
);
--> statement-breakpoint
ALTER TABLE "sponsor_exit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_notice_obligations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"import_row_id" text NOT NULL,
	"purpose" text NOT NULL,
	"obligation_key" text NOT NULL,
	"recipient_ref" text NOT NULL,
	"contract_year_id" text,
	"seat_id" text,
	"exit_event_id" text,
	"exit_kind" text,
	"employee_exit_seat_id" text,
	"verified_paid_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_notice_obligations_key_uq" UNIQUE("tenant_id","obligation_key"),
	CONSTRAINT "membership_notice_obligations_exit_subject_uq" UNIQUE("tenant_id","exit_event_id","seat_id","purpose"),
	CONSTRAINT "membership_notice_obligations_token_subject_uq" UNIQUE("tenant_id","legal_entity_id","contract_year_id","seat_id","id","purpose"),
	CONSTRAINT "membership_notice_obligations_shape_ck" CHECK (("membership_notice_obligations"."seat_id" is null) = ("membership_notice_obligations"."contract_year_id" is null)
        and (
          ("membership_notice_obligations"."purpose" = 'individual_notice'
            and num_nonnulls("membership_notice_obligations"."exit_event_id", "membership_notice_obligations"."exit_kind", "membership_notice_obligations"."employee_exit_seat_id", "membership_notice_obligations"."verified_paid_end") = 0)
          or ("membership_notice_obligations"."purpose" = 'employer_exit'
            and num_nonnulls("membership_notice_obligations"."seat_id", "membership_notice_obligations"."exit_event_id", "membership_notice_obligations"."exit_kind") = 3
            and (("membership_notice_obligations"."exit_kind" = 'agreement_termination' and "membership_notice_obligations"."employee_exit_seat_id" is null)
              or ("membership_notice_obligations"."exit_kind" = 'employee_departure' and "membership_notice_obligations"."employee_exit_seat_id" is not null
                and "membership_notice_obligations"."employee_exit_seat_id" = "membership_notice_obligations"."seat_id")))
        )),
	CONSTRAINT "membership_notice_obligations_evidence_ck" CHECK ("membership_notice_obligations"."obligation_key" ~ '[^[:space:]]' and "membership_notice_obligations"."recipient_ref" ~ '^[a-z][a-z0-9_]{0,31}:([0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
        and isfinite("membership_notice_obligations"."created_at")
        and ("membership_notice_obligations"."verified_paid_end" is null or isfinite("membership_notice_obligations"."verified_paid_end")))
);
--> statement-breakpoint
ALTER TABLE "membership_notice_obligations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_opt_out_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"legal_entity_id" text NOT NULL,
	"contract_year_id" text NOT NULL,
	"seat_id" text NOT NULL,
	"notice_id" text NOT NULL,
	"notice_purpose" text DEFAULT 'individual_notice' NOT NULL,
	"format_version" integer NOT NULL,
	"derivation_version" integer NOT NULL,
	"token_hash" text NOT NULL,
	"issued_by" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invalidated_at" timestamp with time zone,
	CONSTRAINT "membership_opt_out_tokens_format_hash_uq" UNIQUE("format_version","token_hash"),
	CONSTRAINT "membership_opt_out_tokens_notice_uq" UNIQUE("tenant_id","notice_id"),
	CONSTRAINT "membership_opt_out_tokens_hash_ck" CHECK ("membership_opt_out_tokens"."format_version" > 0 and "membership_opt_out_tokens"."derivation_version" > 0
        and "membership_opt_out_tokens"."token_hash" ~ '^[0-9a-f]{64}$' and "membership_opt_out_tokens"."notice_purpose" = 'individual_notice'),
	CONSTRAINT "membership_opt_out_tokens_time_ck" CHECK (isfinite("membership_opt_out_tokens"."issued_at") and ("membership_opt_out_tokens"."invalidated_at" is null
        or (isfinite("membership_opt_out_tokens"."invalidated_at") and "membership_opt_out_tokens"."invalidated_at" >= "membership_opt_out_tokens"."issued_at")))
);
--> statement-breakpoint
ALTER TABLE "membership_opt_out_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership_import_assignments" ADD CONSTRAINT "membership_import_assignments_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_assignments" ADD CONSTRAINT "membership_import_assignments_sponsor_fk" FOREIGN KEY ("tenant_id","sponsor_id") REFERENCES "public"."sponsors"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_assignments" ADD CONSTRAINT "membership_import_assignments_staff_fk" FOREIGN KEY ("tenant_id","staff_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_assignments" ADD CONSTRAINT "membership_import_assignments_approver_fk" FOREIGN KEY ("tenant_id","approved_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_assignments" ADD CONSTRAINT "membership_import_assignments_revoker_fk" FOREIGN KEY ("tenant_id","revoked_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_contract_years" ADD CONSTRAINT "sponsor_contract_years_term_fk" FOREIGN KEY ("tenant_id","term_id","sponsor_id","legal_entity_id") REFERENCES "public"."sponsor_terms"("tenant_id","id","sponsor_id","legal_entity_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_contract_years" ADD CONSTRAINT "sponsor_contract_years_verifier_fk" FOREIGN KEY ("tenant_id","verified_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_lists" ADD CONSTRAINT "membership_import_lists_upload_claim_fk" FOREIGN KEY ("tenant_id","upload_key","upload_anchor_position","upload_fingerprint","upload_list_count") REFERENCES "public"."membership_import_lists"("tenant_id","upload_key","upload_position","upload_fingerprint","upload_list_count") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_lists" ADD CONSTRAINT "membership_import_lists_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_lists" ADD CONSTRAINT "membership_import_lists_revision_fk" FOREIGN KEY ("term_id","commercial_revision") REFERENCES "public"."sponsor_term_revisions"("term_id","revision") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_lists" ADD CONSTRAINT "membership_import_lists_submitter_fk" FOREIGN KEY ("tenant_id","submitted_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_lists" ADD CONSTRAINT "membership_import_lists_verifier_fk" FOREIGN KEY ("tenant_id","verified_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_lists" ADD CONSTRAINT "membership_import_lists_decider_fk" FOREIGN KEY ("tenant_id","decided_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_import_rows" ADD CONSTRAINT "membership_import_rows_member_fk" FOREIGN KEY ("tenant_id","member_user_id") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_exit_events" ADD CONSTRAINT "sponsor_exit_events_actor_fk" FOREIGN KEY ("tenant_id","recorded_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_opt_out_tokens" ADD CONSTRAINT "membership_opt_out_tokens_notice_fk" FOREIGN KEY ("tenant_id","legal_entity_id","contract_year_id","seat_id","notice_id","notice_purpose") REFERENCES "public"."membership_notice_obligations"("tenant_id","legal_entity_id","contract_year_id","seat_id","id","purpose") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_opt_out_tokens" ADD CONSTRAINT "membership_opt_out_tokens_issuer_fk" FOREIGN KEY ("tenant_id","issued_by") REFERENCES "public"."user"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "membership_import_assignments_staff_idx" ON "membership_import_assignments" USING btree ("tenant_id","staff_user_id","legal_entity_id");--> statement-breakpoint
CREATE POLICY "membership_import_assignments_select" ON "membership_import_assignments" AS PERMISSIVE FOR SELECT TO public USING ("membership_import_assignments"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and ((select current_setting('app.current_actor_role', true)) = 'tenant_admin'
          or ((select current_setting('app.current_actor_role', true)) = 'staff'
            and "membership_import_assignments"."capacity" = 'import'
            and "membership_import_assignments"."staff_user_id" = (select current_setting('app.current_actor_id', true)))));--> statement-breakpoint
CREATE POLICY "membership_import_assignments_insert" ON "membership_import_assignments" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("membership_import_assignments"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "membership_import_assignments"."approved_by" = (select current_setting('app.current_actor_id', true))
        and "membership_import_assignments"."revoked_at" is null);--> statement-breakpoint
CREATE POLICY "membership_import_assignments_revoke" ON "membership_import_assignments" AS PERMISSIVE FOR UPDATE TO public USING ("membership_import_assignments"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "membership_import_assignments"."revoked_at" is null) WITH CHECK ("membership_import_assignments"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "membership_import_assignments"."revoked_at" is not null
        and "membership_import_assignments"."revoked_by" = (select current_setting('app.current_actor_id', true)));--> statement-breakpoint
CREATE POLICY "sponsor_contract_years_select" ON "sponsor_contract_years" AS PERMISSIVE FOR SELECT TO public USING ("sponsor_contract_years"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and ((select current_setting('app.current_actor_role', true)) = 'tenant_admin'
          or ((select current_setting('app.current_actor_role', true)) = 'staff' and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = "sponsor_contract_years"."tenant_id"
              and assignment.legal_entity_id = "sponsor_contract_years"."legal_entity_id"
              and assignment.capacity = 'import'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and assignment.sponsor_id = "sponsor_contract_years"."sponsor_id"
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ))));--> statement-breakpoint
CREATE POLICY "sponsor_contract_years_insert" ON "sponsor_contract_years" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("sponsor_contract_years"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "sponsor_contract_years"."verified_by" = (select current_setting('app.current_actor_id', true)));--> statement-breakpoint
CREATE POLICY "sponsor_contract_years_limit_update" ON "sponsor_contract_years" AS PERMISSIVE FOR UPDATE TO public USING ("sponsor_contract_years"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin') WITH CHECK ("sponsor_contract_years"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin');--> statement-breakpoint
CREATE POLICY "membership_import_lists_select" ON "membership_import_lists" AS PERMISSIVE FOR SELECT TO public USING ("membership_import_lists"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (((select current_setting('app.current_actor_role', true)) = 'tenant_admin' and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = "membership_import_lists"."tenant_id"
              and assignment.legal_entity_id = "membership_import_lists"."legal_entity_id"
              and assignment.capacity = 'decision'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = "membership_import_lists"."source_key" or assignment.sponsor_id = "membership_import_lists"."sponsor_id")
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ))
          or ((select current_setting('app.current_actor_role', true)) = 'staff' and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = "membership_import_lists"."tenant_id"
              and assignment.legal_entity_id = "membership_import_lists"."legal_entity_id"
              and assignment.capacity = 'import'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = "membership_import_lists"."source_key" or assignment.sponsor_id = "membership_import_lists"."sponsor_id")
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ))));--> statement-breakpoint
CREATE POLICY "membership_import_lists_insert" ON "membership_import_lists" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("membership_import_lists"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and "membership_import_lists"."decision" is null
        and "membership_import_lists"."submitted_by" = (select current_setting('app.current_actor_id', true))
        and "membership_import_lists"."verified_by" = "membership_import_lists"."submitted_by"
        and (select current_setting('app.current_actor_role', true)) = 'staff'
        and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = "membership_import_lists"."tenant_id"
              and assignment.legal_entity_id = "membership_import_lists"."legal_entity_id"
              and assignment.capacity = 'import'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = "membership_import_lists"."source_key" or assignment.sponsor_id = "membership_import_lists"."sponsor_id")
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ));--> statement-breakpoint
CREATE POLICY "membership_import_lists_decide" ON "membership_import_lists" AS PERMISSIVE FOR UPDATE TO public USING ("membership_import_lists"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "membership_import_lists"."decision" is null) WITH CHECK ("membership_import_lists"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "membership_import_lists"."decided_by" = (select current_setting('app.current_actor_id', true))
        and "membership_import_lists"."decision" is not null
        and "membership_import_lists"."decided_by" <> "membership_import_lists"."submitted_by"
        and "membership_import_lists"."decided_by" <> "membership_import_lists"."verified_by"
        and exists (
            select 1 from public.membership_import_assignments as assignment
            where assignment.tenant_id = "membership_import_lists"."tenant_id"
              and assignment.legal_entity_id = "membership_import_lists"."legal_entity_id"
              and assignment.capacity = 'decision'
              and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
              and (assignment.source_key = "membership_import_lists"."source_key" or assignment.sponsor_id = "membership_import_lists"."sponsor_id")
              and assignment.revoked_at is null
              and assignment.valid_from <= statement_timestamp()
              and assignment.valid_until > statement_timestamp()
          ));--> statement-breakpoint
CREATE POLICY "membership_import_rows_select" ON "membership_import_rows" AS PERMISSIVE FOR SELECT TO public USING ("membership_import_rows"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and exists (
          select 1 from public.membership_import_lists as import_list
          where import_list.tenant_id = "membership_import_rows"."tenant_id"
            and import_list.legal_entity_id = "membership_import_rows"."legal_entity_id"
            and import_list.id = "membership_import_rows"."list_id"
        ));--> statement-breakpoint
CREATE POLICY "membership_import_rows_insert" ON "membership_import_rows" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("membership_import_rows"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and "membership_import_rows"."fulfillment_state" = 'pending'
        and exists (
          select 1 from public.membership_import_lists as import_list
          where import_list.tenant_id = "membership_import_rows"."tenant_id"
            and import_list.legal_entity_id = "membership_import_rows"."legal_entity_id"
            and import_list.id = "membership_import_rows"."list_id"
            and import_list.decision is null
            and import_list.submitted_by = (select current_setting('app.current_actor_id', true))
            and "membership_import_rows"."source_row" <= import_list.row_count
            and exists (
              select 1 from public.membership_import_assignments as assignment
              where assignment.tenant_id = import_list.tenant_id
                and assignment.legal_entity_id = import_list.legal_entity_id
                and assignment.capacity = 'import'
                and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
                and (assignment.source_key = import_list.source_key
                  or assignment.sponsor_id = import_list.sponsor_id)
                and assignment.revoked_at is null
                and assignment.valid_from <= statement_timestamp()
                and assignment.valid_until > statement_timestamp()
            )
        )
        and (select current_setting('app.current_actor_role', true)) = 'staff');--> statement-breakpoint
CREATE POLICY "sponsor_contract_year_seats_select" ON "sponsor_contract_year_seats" AS PERMISSIVE FOR SELECT TO public USING ("sponsor_contract_year_seats"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and exists (
          select 1 from public.membership_import_rows as import_row
          where import_row.tenant_id = "sponsor_contract_year_seats"."tenant_id"
            and import_row.legal_entity_id = "sponsor_contract_year_seats"."legal_entity_id"
            and import_row.id = "sponsor_contract_year_seats"."import_row_id"
        ));--> statement-breakpoint
CREATE POLICY "sponsor_contract_year_seats_reserve" ON "sponsor_contract_year_seats" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("sponsor_contract_year_seats"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'staff'
        and exists (
          select 1 from public.membership_import_rows as import_row
          join public.membership_import_lists as import_list
            on import_list.tenant_id = import_row.tenant_id
            and import_list.legal_entity_id = import_row.legal_entity_id
            and import_list.id = import_row.list_id
          where import_row.tenant_id = "sponsor_contract_year_seats"."tenant_id"
            and import_row.legal_entity_id = "sponsor_contract_year_seats"."legal_entity_id"
            and import_row.id = "sponsor_contract_year_seats"."import_row_id"
            and import_list.decision is null
            and import_list.submitted_by = (select current_setting('app.current_actor_id', true))
            and exists (
              select 1 from public.membership_import_assignments as assignment
              where assignment.tenant_id = import_list.tenant_id
                and assignment.legal_entity_id = import_list.legal_entity_id
                and assignment.capacity = 'import'
                and assignment.staff_user_id = (select current_setting('app.current_actor_id', true))
                and (assignment.source_key = import_list.source_key
                  or assignment.sponsor_id = import_list.sponsor_id)
                and assignment.revoked_at is null
                and assignment.valid_from <= statement_timestamp()
                and assignment.valid_until > statement_timestamp()
            )
        ));--> statement-breakpoint
CREATE POLICY "sponsor_exit_events_select" ON "sponsor_exit_events" AS PERMISSIVE FOR SELECT TO public USING ("sponsor_exit_events"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin');--> statement-breakpoint
CREATE POLICY "sponsor_exit_events_record" ON "sponsor_exit_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("sponsor_exit_events"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "sponsor_exit_events"."recorded_by" = (select current_setting('app.current_actor_id', true)));--> statement-breakpoint
CREATE POLICY "membership_notice_obligations_select" ON "membership_notice_obligations" AS PERMISSIVE FOR SELECT TO public USING ("membership_notice_obligations"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin');--> statement-breakpoint
CREATE POLICY "membership_notice_obligations_record" ON "membership_notice_obligations" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("membership_notice_obligations"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin');--> statement-breakpoint
CREATE POLICY "membership_opt_out_tokens_select" ON "membership_opt_out_tokens" AS PERMISSIVE FOR SELECT TO public USING ("membership_opt_out_tokens"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin');--> statement-breakpoint
CREATE POLICY "membership_opt_out_tokens_issue" ON "membership_opt_out_tokens" AS PERMISSIVE FOR INSERT TO public WITH CHECK ("membership_opt_out_tokens"."tenant_id" = (select current_setting('app.current_access_tenant_id', true))
        and (select current_setting('app.current_access_tenant_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_id', true)) ~ '[^[:space:]]'
        and (select current_setting('app.current_actor_role', true)) = 'tenant_admin'
        and "membership_opt_out_tokens"."issued_by" = (select current_setting('app.current_actor_id', true))
        and "membership_opt_out_tokens"."invalidated_at" is null);
--> statement-breakpoint
-- Cross-module references and PostgreSQL features outside the additive Drizzle builder grammar.
ALTER TABLE public.membership_import_lists
  ADD CONSTRAINT membership_import_lists_company_year_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, sponsor_id, term_id)
  REFERENCES public.sponsor_contract_years (tenant_id, legal_entity_id, id, sponsor_id, term_id);
--> statement-breakpoint
ALTER TABLE public.membership_import_rows
  ADD CONSTRAINT membership_import_rows_list_origin_fk
  FOREIGN KEY (tenant_id, legal_entity_id, list_id, origin)
  REFERENCES public.membership_import_lists (tenant_id, legal_entity_id, id, origin),
  ADD CONSTRAINT membership_import_rows_list_year_fk
  FOREIGN KEY (tenant_id, legal_entity_id, list_id, contract_year_id)
  REFERENCES public.membership_import_lists (tenant_id, legal_entity_id, id, contract_year_id);
--> statement-breakpoint
-- Null identity_released_at keeps each claim active across successive lists.
CREATE UNIQUE INDEX membership_import_rows_active_stable_uq
  ON public.membership_import_rows (tenant_id, stable_identity_namespace, stable_identity_key)
  WHERE identity_released_at IS NULL AND stable_identity_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX membership_import_rows_active_alias_uq
  ON public.membership_import_rows (tenant_id, email_alias_key)
  WHERE identity_released_at IS NULL AND email_alias_key IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX membership_import_rows_active_member_uq
  ON public.membership_import_rows (tenant_id, member_user_id)
  WHERE identity_released_at IS NULL AND member_user_id IS NOT NULL;
--> statement-breakpoint
-- Migration 0099 installed btree_gist. Different years may share a boundary date.
ALTER TABLE public.sponsor_contract_years
  ADD CONSTRAINT sponsor_contract_years_agreement_window_excl
  EXCLUDE USING gist (
    tenant_id WITH =,
    agreement_key WITH =,
    daterange(starts_on, ends_before, '[)') WITH &&
  );
--> statement-breakpoint
-- Changing the referenced limit key serializes with seat insertion. The cascade rechecks
-- every occupied slot in the same statement and rolls back both sides on failure.
ALTER TABLE public.sponsor_contract_year_seats
  ADD CONSTRAINT sponsor_contract_year_seats_limit_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, year_current_limit)
  REFERENCES public.sponsor_contract_years (tenant_id, legal_entity_id, id, current_limit)
  ON UPDATE CASCADE,
  ADD CONSTRAINT sponsor_contract_year_seats_row_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, import_row_id)
  REFERENCES public.membership_import_rows (tenant_id, legal_entity_id, contract_year_id, id);
--> statement-breakpoint
ALTER TABLE public.sponsor_exit_events
  ADD CONSTRAINT sponsor_exit_events_agreement_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, agreement_key)
  REFERENCES public.sponsor_contract_years (tenant_id, legal_entity_id, id, agreement_key),
  ADD CONSTRAINT sponsor_exit_events_employee_seat_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, employee_seat_id)
  REFERENCES public.sponsor_contract_year_seats (tenant_id, legal_entity_id, contract_year_id, id);
--> statement-breakpoint
ALTER TABLE public.membership_notice_obligations
  ADD CONSTRAINT membership_notice_obligations_row_fk
  FOREIGN KEY (tenant_id, legal_entity_id, import_row_id)
  REFERENCES public.membership_import_rows (tenant_id, legal_entity_id, id),
  ADD CONSTRAINT membership_notice_obligations_seat_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, seat_id, import_row_id)
  REFERENCES public.sponsor_contract_year_seats (tenant_id, legal_entity_id, contract_year_id, id, import_row_id),
  ADD CONSTRAINT membership_notice_obligations_exit_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, exit_event_id, exit_kind)
  REFERENCES public.sponsor_exit_events (tenant_id, legal_entity_id, contract_year_id, id, kind),
  ADD CONSTRAINT membership_notice_obligations_exit_employee_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, exit_event_id, employee_exit_seat_id)
  REFERENCES public.sponsor_exit_events (tenant_id, legal_entity_id, contract_year_id, id, employee_seat_id);
--> statement-breakpoint
ALTER TABLE public.membership_opt_out_tokens
  ADD CONSTRAINT membership_opt_out_tokens_seat_fk
  FOREIGN KEY (tenant_id, legal_entity_id, contract_year_id, seat_id)
  REFERENCES public.sponsor_contract_year_seats (tenant_id, legal_entity_id, contract_year_id, id);
--> statement-breakpoint
ALTER TABLE public.membership_import_assignments FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_import_lists FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_import_rows FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sponsor_contract_years FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sponsor_contract_year_seats FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.sponsor_exit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_notice_obligations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE public.membership_opt_out_tokens FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- One individual notice per import row, whatever key a caller supplies.
CREATE UNIQUE INDEX membership_notice_obligations_individual_uq
  ON public.membership_notice_obligations (tenant_id, import_row_id)
  WHERE purpose = 'individual_notice';
--> statement-breakpoint
-- An update changes only the columns its trigger admits: the decision columns of a list,
-- the revocation of an assignment and the current limit of a contract year. This holds for
-- every writer, whatever table privileges a role is given.
CREATE FUNCTION public.wp09_update_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE check_violation USING
      MESSAGE = format('WP-09: an update of %s changes only its admitted columns', TG_TABLE_NAME),
      CONSTRAINT = TG_TABLE_NAME || '_update_scope';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER membership_import_lists_update_scope
  BEFORE UPDATE ON public.membership_import_lists
  FOR EACH ROW EXECUTE FUNCTION public.wp09_update_scope_guard('decision', 'decided_by', 'decided_at', 'decided_digest');
--> statement-breakpoint
CREATE TRIGGER membership_import_assignments_update_scope
  BEFORE UPDATE ON public.membership_import_assignments
  FOR EACH ROW EXECUTE FUNCTION public.wp09_update_scope_guard('revoked_at', 'revoked_by');
--> statement-breakpoint
CREATE TRIGGER sponsor_contract_years_update_scope
  BEFORE UPDATE ON public.sponsor_contract_years
  FOR EACH ROW EXECUTE FUNCTION public.wp09_update_scope_guard('current_limit');
--> statement-breakpoint
-- A list commits with all of its rows. Positions are unique and bounded by row_count, so a
-- committed list admits no further row, and a decision never races a row insert.
CREATE FUNCTION public.membership_import_list_complete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  present integer;
BEGIN
  SELECT count(*) INTO present
  FROM public.membership_import_rows AS import_row
  WHERE import_row.tenant_id = NEW.tenant_id
    AND import_row.legal_entity_id = NEW.legal_entity_id
    AND import_row.list_id = NEW.id;
  IF present <> NEW.row_count THEN
    RAISE check_violation USING
      MESSAGE = 'WP-09: a list commits with all of its rows',
      CONSTRAINT = 'membership_import_lists_complete';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER membership_import_lists_complete
  AFTER INSERT ON public.membership_import_lists
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.membership_import_list_complete_guard();
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.wp09_update_scope_guard(), public.membership_import_list_complete_guard()
  FROM PUBLIC;
--> statement-breakpoint
-- Dormant: no runtime call path reads or writes these tables yet, so no role receives any
-- privilege here (the B1 derivation rule). The writer PR adds its exact grants through the
-- runtime-grants function. Clear any inherited defaults from the migration owner's default ACLs.
REVOKE ALL ON TABLE
  public.membership_import_assignments, public.membership_import_lists, public.membership_import_rows,
  public.sponsor_contract_years, public.sponsor_contract_year_seats, public.sponsor_exit_events,
  public.membership_notice_obligations, public.membership_opt_out_tokens
  FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
  target_role name;
BEGIN
  FOR target_role IN
    SELECT rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role', 'interdomestik_runtime_rls')
  LOOP
    EXECUTE format(
      'REVOKE ALL ON TABLE
        public.membership_import_assignments, public.membership_import_lists, public.membership_import_rows,
        public.sponsor_contract_years, public.sponsor_contract_year_seats, public.sponsor_exit_events,
        public.membership_notice_obligations, public.membership_opt_out_tokens FROM %I', target_role
    );
  END LOOP;
END;
$$;
