import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import { withDisposableClient } from '../src/disposable-client';
import * as schema from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import { runSequentially } from './in-order';
import {
  restricted,
  role,
  runtimeRole,
  type LegacyPreviews,
  type Rows,
} from './wp11-notification-deliveries-rls.fixture';

/** Seeds a user as the owner, for parents the runtime role may not create. */
async function insertUser(client: postgres.Sql, id: string, tenantId: string, userRole: string) {
  const email = `${id}@example.test`;
  await client`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
    values (${id}, ${tenantId}, 'Test user', ${email}, true, ${userRole}, now(), now())`;
}

export const appendedTables = [
  'notification_preview_restrictions',
  'support_handoff_first_responses',
  'user_locale_preferences',
] as const;

/** Runs `work` in a Drizzle transaction as the runtime role, scoped to `tenantId`. */
function asRuntime<T>(
  client: postgres.Sql,
  tenantId: string,
  work: (tx: TenantTransaction) => Promise<T>
) {
  return drizzle(client, { schema }).transaction(async tx => {
    await tx.execute(sql.raw(`set local role ${role}`));
    await tx.execute(sql`set local row_security = on`);
    await tx.execute(sql`select set_config('app.current_access_tenant_id', ${tenantId}, true),
      set_config('app.current_tenant_id', ${tenantId}, true)`);
    return work(tx);
  });
}

async function flagsOf(client: postgres.Sql, ids: readonly string[]) {
  const rows = await client`select n.id, f.restricted
    from notifications n
    left join notification_preview_restrictions f
      on f.tenant_id = n.tenant_id and f.notification_id = n.id
    where n.id in ${client(ids)} order by n.id`;
  return Object.fromEntries(rows.map(row => [row.id as string, row.restricted as boolean | null]));
}

/** R-37 #16: a legacy flagless row stays unknown, also when a later enqueue repeats its id. */
export async function proveLegacyPreviewState(client: postgres.Sql, legacy: LegacyPreviews) {
  assert.deepEqual(await flagsOf(client, [legacy.existing, legacy.rollout]), {
    [legacy.existing]: null,
    [legacy.rollout]: null,
  });
  const { enqueueClaimInboxNotifications } =
    await import('../../domain-communications/src/notification-deliveries/in-app');
  const fresh = 'wp11-notification-fresh';
  const row = (id: string, previewRestricted: boolean) => ({
    id,
    tenantId: legacy.tenant,
    userId: legacy.user,
    type: 'new_message',
    title: 'New Message',
    content: 'Update',
    actionUrl: `/member/claims/${legacy.claim}`,
    previewRestricted,
  });
  await asRuntime(client, legacy.tenant, tx =>
    enqueueClaimInboxNotifications(tx, [row(legacy.existing, false), row(fresh, true)])
  );
  assert.deepEqual(await flagsOf(client, [legacy.existing, fresh]), {
    [legacy.existing]: null,
    [fresh]: true,
  });
}

/** Grants, tenant policies and FK tenant binding of the three appended tables. */
export async function proveAppendedTableIsolation(client: postgres.Sql, a: Rows, b: Rows) {
  const posture = await client`select relname, relrowsecurity, relforcerowsecurity,
      has_table_privilege(${runtimeRole}, oid, 'SELECT') as can_select,
      has_table_privilege(${runtimeRole}, oid, 'INSERT') as can_insert,
      has_table_privilege(${runtimeRole}, oid, 'UPDATE') as can_update,
      has_table_privilege(${runtimeRole}, oid, 'DELETE') as can_delete
    from pg_class where relname in ${client(appendedTables)} order by relname`;
  assert.deepEqual(
    [...posture],
    appendedTables.map(relname => ({
      relname,
      relrowsecurity: true,
      relforcerowsecurity: true,
      can_select: true,
      can_insert: true,
      can_update: relname === 'user_locale_preferences',
      can_delete: false,
    }))
  );

  await restricted(client, a.tenant, async tx => {
    const visible = await tx`select
      (select count(*)::int from notification_preview_restrictions) as flags,
      (select count(*)::int from support_handoff_first_responses) as firsts,
      (select count(*)::int from user_locale_preferences) as locales`;
    assert.deepEqual([...visible], [{ flags: 1, firsts: 1, locales: 1 }]);
  });

  const denied = async (
    statement: (tx: postgres.TransactionSql) => Promise<unknown>,
    code: string
  ) => assert.rejects(restricted(client, a.tenant, statement), { code });
  // Another tenant's rows: the policy's WITH CHECK refuses them.
  await denied(
    tx => tx`insert into user_locale_preferences (user_id, tenant_id, locale)
      values (${b.user}, ${b.tenant}, 'mk')`,
    '42501'
  );
  await denied(
    tx => tx`insert into notification_preview_restrictions (notification_id, tenant_id, restricted)
      values (${b.notification}, ${b.tenant}, false)`,
    '42501'
  );
  // Own tenant, foreign parent: the composite FK refuses it. The parents have no child row yet,
  // so the primary key cannot refuse first.
  const bare = {
    user: `${b.tenant}-bare-user`,
    notification: `${b.tenant}-bare-notification`,
    handoff: `${b.tenant}-bare-handoff`,
  };
  await insertUser(client, bare.user, b.tenant, 'member');
  await client`insert into notifications (id, tenant_id, user_id, type, title, content, action_url)
    values (${bare.notification}, ${b.tenant}, ${bare.user}, 'new_message', 'New Message', 'Update', '/member')`;
  await client`insert into support_handoffs (id, tenant_id, member_id, subject, message, urgency, trust_risk)
    values (${bare.handoff}, ${b.tenant}, ${bare.user}, 'Subject', 'Message', 'normal', 'low')`;
  await denied(
    tx => tx`insert into user_locale_preferences (user_id, tenant_id, locale)
      values (${bare.user}, ${a.tenant}, 'mk')`,
    '23503'
  );
  await denied(
    tx => tx`insert into notification_preview_restrictions (notification_id, tenant_id, restricted)
      values (${bare.notification}, ${a.tenant}, false)`,
    '23503'
  );
  await denied(
    tx => tx`insert into support_handoff_first_responses (handoff_id, tenant_id, first_public_response_at)
      values (${bare.handoff}, ${a.tenant}, now())`,
    '23503'
  );
  // No UPDATE on a flag or a first response, no DELETE anywhere.
  await denied(
    tx =>
      tx`update notification_preview_restrictions set restricted = false where notification_id = ${a.notification}`,
    '42501'
  );
  await denied(
    tx =>
      tx`update support_handoff_first_responses set first_public_response_at = now() where handoff_id = ${a.handoff}`,
    '42501'
  );
  await runSequentially(appendedTables, async table => {
    await denied(tx => tx`delete from ${tx(table)}`, '42501');
  });
}

/** The locale save: lock the parent, upsert one row per user, read it back as the runtime role. */
export async function proveLocalePreference(client: postgres.Sql, a: Rows) {
  const { resolveRecipientLocale } =
    await import('../../domain-communications/src/recipient-locale');
  await restricted(client, a.tenant, async tx => {
    const locked = await tx`select id from "user"
      where id = ${a.user} and tenant_id = ${a.tenant} for key share`;
    assert.deepEqual([...locked], [{ id: a.user }]);
    await tx`insert into user_locale_preferences (user_id, tenant_id, locale)
      values (${a.user}, ${a.tenant}, 'mk')
      on conflict (tenant_id, user_id) do update set locale = excluded.locale, updated_at = now()`;
  });
  const locale = await asRuntime(client, a.tenant, tx =>
    resolveRecipientLocale(tx, a.tenant, a.user)
  );
  assert.equal(locale, 'mk');

  // The key-share lock holds a concurrent delete of the user until the save commits. The scratch
  // client has one connection, so the competing delete runs on a second client.
  const [{ name }] = await client`select current_database() as name`;
  const url = new URL(process.env.DATABASE_URL ?? '');
  url.pathname = `/${String(name)}`;
  await withDisposableClient(url.toString(), { applicationName: 'wp11_lock_probe' }, other =>
    restricted(client, a.tenant, async tx => {
      await tx`select id from "user" where id = ${a.user} and tenant_id = ${a.tenant} for key share`;
      await assert.rejects(
        other.begin(async competing => {
          await competing`set local lock_timeout = '200ms'`;
          await competing`delete from "user" where id = ${a.user}`;
        }),
        { code: '55P03' }
      );
    })
  );
}

/** FK actions: children follow their parent, also when the runtime role deletes it under FORCE RLS. */
export async function proveCascades(client: postgres.Sql, a: Rows, b: Rows) {
  const count = async (table: string, column: string, value: string) => {
    const [row] =
      await client`select count(*)::int as n from ${client(table)} where ${client(column)} = ${value}`;
    return row.n as number;
  };

  // The handoff cleanup path: the runtime role deletes an inbox row, and its flag goes with it
  // although the role holds no DELETE on the flag table.
  await restricted(client, a.tenant, async tx => {
    const deleted = await tx`delete from notifications where id = ${a.notification} returning id`;
    assert.equal(deleted.length, 1);
  });
  assert.equal(
    await count('notification_preview_restrictions', 'notification_id', a.notification),
    0
  );

  await client`delete from support_handoffs where id = ${b.handoff}`;
  assert.equal(await count('support_handoff_first_responses', 'handoff_id', b.handoff), 0);

  // A staff answer survives its actor's deletion, without the actor.
  const staff = `${b.tenant}-staff`;
  await insertUser(client, staff, b.tenant, 'staff');
  await client`update claim_response_requests set answered_at = now(), answered_by = ${staff},
    answer_kind = 'member_visible_status_change' where id = ${a.request}`;
  await client`delete from "user" where id = ${staff}`;
  const [answer] =
    await client`select answered_by, answered_at is not null as answered from claim_response_requests where id = ${a.request}`;
  assert.deepEqual(answer, { answered_by: null, answered: true });

  // A source message takes its response request and its deliveries with it.
  const sourceRequest = `${b.tenant}-source-request`;
  await client`insert into claim_response_requests (id, tenant_id, claim_id, kind, source_message_id, requested_at)
    values (${sourceRequest}, ${b.tenant}, ${b.claim}, 'member_message', ${b.message}, now())`;
  await client`delete from claim_messages where id = ${b.message}`;
  assert.equal(await count('claim_response_requests', 'source_message_id', b.message), 0);
  assert.equal(await count('notification_deliveries', 'subject_message_id', b.message), 0);

  // A claim takes its remaining requests and deliveries; a user takes its locale preference.
  await client`delete from claim where id = ${b.claim}`;
  assert.equal(await count('claim_response_requests', 'claim_id', b.claim), 0);
  assert.equal(await count('notification_deliveries', 'claim_id', b.claim), 0);
  const member = `${a.tenant}-member-two`;
  await insertUser(client, member, a.tenant, 'member');
  await client`insert into user_locale_preferences (user_id, tenant_id, locale)
    values (${member}, ${a.tenant}, 'de')`;
  await client`delete from "user" where id = ${member}`;
  assert.equal(await count('user_locale_preferences', 'user_id', member), 0);
}
