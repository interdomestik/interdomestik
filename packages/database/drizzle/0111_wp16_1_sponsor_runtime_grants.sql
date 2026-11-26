-- Keep the guards in the role-less journal build as well.
CREATE TRIGGER wp16_sponsors_runtime_id_guard
BEFORE UPDATE OF id ON public.sponsors
FOR EACH STATEMENT WHEN (CURRENT_USER = 'interdomestik_runtime_rls'::name)
EXECUTE FUNCTION public.sponsor_reject_update_fn();
--> statement-breakpoint
CREATE TRIGGER wp16_membership_plans_runtime_id_guard
BEFORE UPDATE OF id ON public.membership_plans
FOR EACH STATEMENT WHEN (CURRENT_USER = 'interdomestik_runtime_rls'::name)
EXECUTE FUNCTION public.sponsor_reject_update_fn();
--> statement-breakpoint
CREATE TRIGGER wp16_claim_transition_evidence_runtime_id_guard
BEFORE UPDATE OF id ON public.claim_transition_evidence
FOR EACH STATEMENT WHEN (CURRENT_USER = 'interdomestik_runtime_rls'::name)
EXECUTE FUNCTION public.sponsor_reject_update_fn();
--> statement-breakpoint
DO $$
DECLARE
  legacy_tables constant text[] := ARRAY[
    'claim', 'user', 'claim_escalation_agreements', 'subscriptions',
    'claim_recovery_no_fee_evidence', 'claim_messages', 'sponsor_terms', 'sponsor_roster_entries'
  ];
  relation text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'interdomestik_runtime_rls') THEN
    RETURN;
  END IF;

  -- A different grantor requires reviewed forward reconciliation. RESTRICT also refuses
  -- a revoke that would remove other roles' privileges through a dependent grant.
  FOR relation IN SELECT unnest(legacy_tables) LOOP
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      JOIN pg_catalog.pg_roles grantor ON grantor.oid = acl.grantor
      WHERE a.attrelid = pg_catalog.format('public.%I', relation)::regclass
        AND a.attname = 'id' AND NOT a.attisdropped
        AND acl.grantee = 'interdomestik_runtime_rls'::regrole
        AND acl.privilege_type = 'UPDATE' AND grantor.rolname <> current_user
    ) THEN
      RAISE EXCEPTION 'Unexpected grantor for legacy UPDATE(id) on public.%', relation;
    END IF;
    EXECUTE format(
      'REVOKE UPDATE (id) ON public.%I FROM interdomestik_runtime_rls RESTRICT', relation
    );
  END LOOP;

  GRANT UPDATE ("updatedAt") ON public.claim, public."user" TO interdomestik_runtime_rls;
  GRANT UPDATE (updated_at) ON public.claim_escalation_agreements, public.claim_recovery_no_fee_evidence
    TO interdomestik_runtime_rls;
  GRANT UPDATE (dunning_attempt_count) ON public.subscriptions TO interdomestik_runtime_rls;
  GRANT UPDATE (read_at) ON public.claim_messages TO interdomestik_runtime_rls;
  GRANT UPDATE (id) ON public.sponsors, public.membership_plans, public.claim_transition_evidence
    TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, branch_id, source_lead_id, legal_name),
    INSERT (id, tenant_id, branch_id, source_lead_id, legal_name, registration_number, tax_number,
      billing_contact_name, billing_contact_email, created_by, created_at, updated_at)
    ON public.sponsors TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, sponsor_id, term_start, term_end, legal_entity_id, plan_key, plan_id,
      terminated_effective_at, terminated_by, terminated_at, created_by, created_at),
    INSERT (id, tenant_id, sponsor_id, term_start, term_end, legal_entity_id, plan_key, plan_id,
      terminated_effective_at, terminated_by, terminated_at, created_by, created_at),
    UPDATE (terminated_effective_at, terminated_by, terminated_at)
    ON public.sponsor_terms TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, term_id, revision, seat_count, price_per_seat_minor, currency,
      contract_reference, terms_version, created_by),
    INSERT (id, tenant_id, term_id, revision, seat_count, price_per_seat_minor, currency,
      contract_reference, terms_version, created_by, created_at)
    ON public.sponsor_term_revisions TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, revision_id, decision, decided_by),
    INSERT (id, tenant_id, revision_id, decision, decided_by, decided_at, invoice_reference)
    ON public.sponsor_revision_decisions TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, term_id, first_name, last_name, email_normalized, email_hmac, user_id,
      conflict_decision, conflict_decided_at, added_by, added_at, left_company_at, opted_out_at,
      starts_at, handover_intent_id, revoked_at, revoked_reason, outcome, review_reason, optout_token_hash),
    INSERT (id, tenant_id, term_id, first_name, last_name, email_normalized, email_hmac, user_id,
      conflict_decision, conflict_decided_at, added_by, added_at, left_company_at, opted_out_at,
      starts_at, handover_intent_id, revoked_at, revoked_reason, outcome, review_reason, optout_token_hash),
    UPDATE (conflict_decision, conflict_decided_at, outcome, review_reason, user_id, starts_at,
      handover_intent_id, revoked_at, revoked_reason, opted_out_at, left_company_at)
    ON public.sponsor_roster_entries TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, user_id, subscription_id, provider_subscription_id, state,
      staff_disposition, restoration_cutoff, cancel_dispatched_at, dispatch_period_ends_at, attempts,
      next_attempt_at, paid_until, paid_until_evidence, canceled_confirmed_at, reconciliation_closed_at, updated_at),
    INSERT (id, tenant_id, user_id, subscription_id, provider_subscription_id, state, staff_disposition,
      staff_evidence_id, restoration_cutoff, cancel_dispatched_at, dispatch_period_ends_at, attempts,
      next_attempt_at, paid_until, paid_until_evidence, canceled_confirmed_at, reconciled_through,
      reconciliation_closed_at, created_at, updated_at),
    UPDATE (cancel_dispatched_at, dispatch_period_ends_at, attempts, state, updated_at, paid_until,
      paid_until_evidence, canceled_confirmed_at, reconciled_through, reconciliation_closed_at,
      next_attempt_at, staff_disposition, staff_evidence_id, restoration_cutoff)
    ON public.sponsor_handover_intents TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, intent_id, attempt_no, dispatched_at, outcome),
    INSERT (id, tenant_id, intent_id, attempt_no, dispatched_at, authorizing_entry_id, authorizing_term_id,
      authorizing_term_start, authorizing_end, boundary_at, outcome, evidence_ref, resolved_at),
    UPDATE (outcome, evidence_ref, resolved_at)
    ON public.sponsor_handover_cancel_attempts TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, intent_id, provider_transaction_id, billing_period_starts_at, found_at, staff_task_id),
    INSERT (id, tenant_id, intent_id, provider_transaction_id, billing_period_starts_at, found_at, staff_task_id),
    UPDATE (staff_task_id)
    ON public.sponsor_handover_charges TO interdomestik_runtime_rls;

  GRANT SELECT (id, tenant_id, roster_entry_id, handover_intent_id, user_id, kind, idempotency_key,
      state, lease_until, attempts, next_attempt_at, terminal_at, last_error_code, created_at),
    INSERT (id, tenant_id, roster_entry_id, handover_intent_id, user_id, kind, idempotency_key,
      state, lease_until, attempts, next_attempt_at, terminal_at, last_error_code, created_at),
    UPDATE (state, lease_until, attempts, next_attempt_at, terminal_at, last_error_code)
    ON public.sponsor_mail_outbox TO interdomestik_runtime_rls;
END
$$;
