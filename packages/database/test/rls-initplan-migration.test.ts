import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0075_optimize_tenant_rls_initplan.sql', import.meta.url)
);
const TARGET_EXPR = "tenant_id = (select current_setting(''app.current_tenant_id'', true))::text";

const USING_ONLY_TABLES = [
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
  'subscriptions',
] as const;

const WITH_CHECK_TABLES = [
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
  'webhook_events',
] as const;

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function extractArray(sql: string, name: string): string[] {
  const startMarker = `${name} constant text[] := ARRAY[`;
  const start = sql.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing ${name} declaration`);
  const bodyStart = start + startMarker.length;
  const bodyEnd = sql.indexOf('];', bodyStart);
  assert.notEqual(bodyEnd, -1, `Missing ${name} terminator`);
  return [...sql.slice(bodyStart, bodyEnd).matchAll(/'([^']+)'/g)].map(([, value]) => value);
}

const comparePolicyTargets = (left: string, right: string): number => left.localeCompare(right);

test('ENT-DB04 migration targets exactly the 53 scoped tenant-isolation policies', () => {
  const sql = migrationSql();
  const usingOnly = extractArray(sql, 'using_only_tables');
  const withCheck = extractArray(sql, 'with_check_tables');
  const allTargets = [...usingOnly, ...withCheck].sort(comparePolicyTargets);
  const expectedTargets = [...USING_ONLY_TABLES, ...WITH_CHECK_TABLES].sort(comparePolicyTargets);

  assert.deepEqual(usingOnly, USING_ONLY_TABLES);
  assert.deepEqual(withCheck, WITH_CHECK_TABLES);
  assert.equal(usingOnly.length, 15);
  assert.equal(withCheck.length, 38);
  assert.equal(new Set(allTargets).size, 53);
  assert.deepEqual(allTargets, expectedTargets);
});

test('ENT-DB04 migration preserves policy shape and uses the initPlan expression', () => {
  const sql = migrationSql();

  assert.match(sql, /ALTER POLICY %I ON public\.%I USING \(%s\)'/);
  assert.match(sql, /ALTER POLICY %I ON public\.%I USING \(%s\) WITH CHECK \(%s\)'/);
  assert.match(sql, /target_policy := format\('tenant_isolation_%s', target_table\)/);
  assert.match(sql, /target_expr constant text :=/);
  assert.ok(sql.includes(TARGET_EXPR));
  assert.doesNotMatch(sql, /tenant_id = current_setting\(''app\.current_tenant_id'', true\)::text/);
});

test('ENT-DB04 migration excludes outside tenant policy families', () => {
  const sql = migrationSql();
  const targets = new Set([
    ...extractArray(sql, 'using_only_tables'),
    ...extractArray(sql, 'with_check_tables'),
  ]);

  for (const forbidden of ['domain_events', 'domain_event_deliveries', 'storage', 'objects']) {
    assert.equal(targets.has(forbidden), false, `Unexpected target ${forbidden}`);
    assert.doesNotMatch(sql, new RegExp(`tenant_isolation_${forbidden}`));
  }
});
