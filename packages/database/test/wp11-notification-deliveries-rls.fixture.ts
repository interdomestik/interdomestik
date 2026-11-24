import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import { runSequentially } from './in-order';
import { migrateJournalBeforeNotificationDeliveries } from './journal-prefix.support';
import { quoteIdentifier } from './rls-test-connection';
import { scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';

export const runtimeRole = 'interdomestik_runtime_rls';
export const role = quoteIdentifier(runtimeRole);
const lockTables = [
  'claim',
  'user',
  'claim_escalation_agreements',
  'subscriptions',
  'membership_plans',
  'sponsor_terms',
  'sponsor_roster_entries',
  'claim_recovery_no_fee_evidence',
  'claim_transition_evidence',
  'claim_messages',
];
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export function grantNotificationDeliveryRowLocks(client: postgres.Sql, tables = lockTables) {
  return runSequentially(tables, async table => {
    await client.unsafe(`grant update (id) on public.${quoteIdentifier(table)} to ${role}`);
  });
}

async function writeLegacyPreview(
  client: postgres.Sql,
  owner: { tenant: string; user: string; claim: string },
  id: string
) {
  const actionUrl = `/member/claims/${owner.claim}`;
  await restricted(client, owner.tenant, async tx => {
    await tx`insert into notifications (id, tenant_id, user_id, type, title, content, action_url)
      values (${id}, ${owner.tenant}, ${owner.user}, 'new_message', 'New Message',
        'Update on: Test claim', ${actionUrl})`;
  });
}

/**
 * Handoffs that exist before the WP-11 migration: one answered once (the backfill copies it), one answered twice
 * and one unanswered (controls the backfill leaves out). `public_response_at` has no time zone.
 */
async function writeLegacyHandoffs(client: postgres.Sql, owner: { tenant: string; user: string }) {
  const handoffs = {
    first: 'wp11-handoff-first',
    repeated: 'wp11-handoff-repeated',
    open: 'wp11-handoff-open',
  };
  const rows: Array<[string, number, string | null]> = [
    [handoffs.first, 1, '2026-11-01 10:00:00'],
    [handoffs.repeated, 2, '2026-11-02 10:00:00'],
    [handoffs.open, 0, null],
  ];
  await runSequentially(rows, async ([id, version, at]) => {
    await client`insert into support_handoffs
      (id, tenant_id, member_id, subject, message, urgency, trust_risk, public_response_version, public_response_at)
      values (${id}, ${owner.tenant}, ${owner.user}, 'Subject', 'Message', 'normal', 'low', ${version}, ${at})`;
  });
  return handoffs;
}

async function install(client: postgres.Sql) {
  const target = await migrateJournalBeforeNotificationDeliveries(client, migrationsFolder);
  assert.ok(target);
  assert.ok(
    target.sql.some(statement =>
      statement.includes('notification_deliveries FORCE ROW LEVEL SECURITY')
    )
  );
  await client.unsafe(`grant usage on schema public to ${role}`);
  await client.unsafe(`grant select (id, tenant_id) on public."user" to ${role}`);
  await client.unsafe(`grant insert (id, tenant_id, user_id, type, title, content, action_url)
    on public.notifications to ${role}`);
  const legacyOwner = await seedOwner(client, 'legacy', 'branch_manager');
  const existing = 'wp11-notification-existing';
  const rollout = 'wp11-notification-rollout';
  await writeLegacyPreview(client, legacyOwner, existing);
  const handoffs = await writeLegacyHandoffs(client, legacyOwner);

  await grantNotificationDeliveryRowLocks(client, lockTables.slice(0, -1));
  const migration = () =>
    client.begin(tx =>
      runSequentially(target.sql, async statement => {
        await tx.unsafe(statement);
      })
    );
  await assert.rejects(
    migration(),
    /WP-11 requires UPDATE privilege for row locking on public.claim_messages/
  );
  const [rolledBack] =
    await client`select to_regclass('public.notification_deliveries') as delivery_table`;
  assert.equal(rolledBack.delivery_table, null);
  await grantNotificationDeliveryRowLocks(client, ['claim_messages']);
  await migration();

  await writeLegacyPreview(client, legacyOwner, rollout);
  // The runtime inbox writer and the handoff cleanup read, insert and delete inbox rows.
  await client.unsafe(`grant select, insert, delete on public.notifications to ${role}`);
  return { ...legacyOwner, existing, rollout, handoffs };
}

async function seedOwner(client: postgres.Sql, group: string, userRole: string) {
  const tenant = `wp11-${group}`;
  const user = `${tenant}-user`;
  const claim = `${tenant}-claim`;
  await client`insert into tenants (id, name, legal_name, country_code) values (${tenant}, ${tenant}, ${tenant}, 'MK')`;
  const email = `${user}@example.test`;
  await client`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
    values (${user}, ${tenant}, 'Test user', ${email}, true, ${userRole}, now(), now())`;
  await client`insert into claim (id, tenant_id, "userId", title, category, "companyName", case_lifecycle_state)
    values (${claim}, ${tenant}, ${user}, 'Test claim', 'vehicle', 'Test company', 'submitted')`;
  return { tenant, user, claim };
}

async function seed(client: postgres.Sql, group: string) {
  const { tenant, user, claim } = await seedOwner(client, group, 'tenant_admin');
  const message = `${tenant}-message`;
  const delivery = `${tenant}-delivery`;
  const request = `${tenant}-request`;
  await client`insert into claim_messages (id, tenant_id, claim_id, sender_id, content)
    values (${message}, ${tenant}, ${claim}, ${user}, 'Test message')`;
  await client`insert into notification_deliveries
    (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, subject_message_id, facts)
    values (${delivery}, ${tenant}, ${delivery}, 'claim_message_to_member', 'email', ${user}, ${claim}, ${message}, '{"previewRestricted":true}')`;
  await client`insert into claim_response_requests (id, tenant_id, claim_id, kind, requested_at)
    values (${request}, ${tenant}, ${claim}, 'claim_submitted', clock_timestamp())`;
  const handoff = `${tenant}-handoff`;
  const notification = `${tenant}-notification`;
  await client`insert into support_handoffs (id, tenant_id, member_id, subject, message, urgency, trust_risk)
    values (${handoff}, ${tenant}, ${user}, 'Subject', 'Message', 'normal', 'low')`;
  await client`insert into support_handoff_first_responses (handoff_id, tenant_id, first_public_response_at)
    values (${handoff}, ${tenant}, now())`;
  await client`insert into notifications (id, tenant_id, user_id, type, title, content, action_url)
    values (${notification}, ${tenant}, ${user}, 'new_message', 'New Message', 'Update', '/member')`;
  await client`insert into notification_preview_restrictions (notification_id, tenant_id, restricted)
    values (${notification}, ${tenant}, true)`;
  await client`insert into user_locale_preferences (user_id, tenant_id, locale)
    values (${user}, ${tenant}, 'sq')`;
  return { tenant, user, claim, message, delivery, request, handoff, notification };
}

export function restricted<T>(
  client: postgres.Sql,
  tenantId: string,
  work: (tx: postgres.TransactionSql) => Promise<T>
) {
  return client.begin(async tx => {
    await tx.unsafe(`set local role ${role}`);
    await tx`set local row_security = on`;
    await tx`select set_config('app.current_access_tenant_id', ${tenantId}, true),
      set_config('app.current_tenant_id', ${tenantId}, true)`;
    return work(tx);
  });
}

export type Rows = Awaited<ReturnType<typeof seed>>;
export type LegacyPreviews = Awaited<ReturnType<typeof install>>;

export async function withNotificationDeliveriesFixture(
  t: TestContext,
  run: (client: postgres.Sql, a: Rows, b: Rows, legacy: LegacyPreviews) => Promise<void>
) {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withScratchDatabase('wp11_notifications', async client => {
    const [existing] = await client`select 1 from pg_roles where rolname=${runtimeRole}`;
    if (!existing) await client.unsafe(`create role ${role} nologin nosuperuser nobypassrls`);
    try {
      const legacy = await install(client);
      const a = await seed(client, 'a');
      const b = await seed(client, 'b');
      await run(client, a, b, legacy);
    } finally {
      if (!existing) {
        await client.unsafe(`drop owned by ${role}`);
        await client.unsafe(`drop role ${role}`);
      }
    }
  });
}
