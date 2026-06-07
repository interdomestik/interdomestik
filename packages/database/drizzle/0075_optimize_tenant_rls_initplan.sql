-- Wrap the tenant-context setting lookup so Postgres can treat it as an initPlan
-- for the live repo-owned tenant-isolation policies flagged by Supabase.
DO $$
DECLARE
  using_only_tables constant text[] := ARRAY[
    'agent_clients',
    'agent_commissions',
    'audit_log',
    'claim',
    'claim_documents',
    'claim_escalation_agreements',
    'claim_messages',
    'claim_stage_history',
    'crm_activities',
    'crm_deals',
    'crm_leads',
    'member_activities',
    'member_notes',
    'notifications',
    'subscriptions'
  ];
  with_check_tables constant text[] := ARRAY[
    'agent_settings',
    'ai_runs',
    'automation_logs',
    'billing_invoices',
    'billing_ledger_entries',
    'branches',
    'claim_counters',
    'claim_threads',
    'claim_tracking_tokens',
    'commercial_action_idempotency',
    'document_access_log',
    'document_extractions',
    'documents',
    'email_campaign_logs',
    'engagement_email_sends',
    'lead_downloads',
    'lead_payment_attempts',
    'leads',
    'member_leads',
    'member_referral_rewards',
    'member_referral_settings',
    'membership_cards',
    'membership_family_members',
    'membership_plans',
    'nps_survey_responses',
    'nps_survey_tokens',
    'partner_discount_usage',
    'policies',
    'push_subscriptions',
    'referrals',
    'service_requests',
    'service_usage',
    'share_packs',
    'tenant_settings',
    'user',
    'user_notification_preferences',
    'user_roles',
    'webhook_events'
  ];
  target_table text;
  target_policy text;
  target_expr constant text :=
    'tenant_id = (select current_setting(''app.current_tenant_id'', true))::text';
BEGIN
  FOREACH target_table IN ARRAY using_only_tables
  LOOP
    target_policy := format('tenant_isolation_%s', target_table);
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (%s)',
      target_policy,
      target_table,
      target_expr
    );
  END LOOP;

  FOREACH target_table IN ARRAY with_check_tables
  LOOP
    target_policy := format('tenant_isolation_%s', target_table);
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)',
      target_policy,
      target_table,
      target_expr,
      target_expr
    );
  END LOOP;
END;
$$;
