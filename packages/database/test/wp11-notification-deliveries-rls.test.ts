import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import * as schema from '../src/schema';
import {
  restricted,
  role,
  runtimeRole,
  withNotificationDeliveriesFixture,
  type Rows,
} from './wp11-notification-deliveries-rls.fixture';

async function proveLocaleColumnGrant(client: postgres.Sql, a: Rows) {
  await restricted(client, a.tenant, async tx => {
    const [grants] = await tx`select
      has_table_privilege(current_user, 'public."user"', 'SELECT') as table_select,
      has_table_privilege(current_user, 'public."user"', 'UPDATE') as table_update,
      has_column_privilege(current_user, 'public."user"', 'preferred_locale', 'SELECT') as locale_select,
      has_column_privilege(current_user, 'public."user"', 'preferred_locale', 'UPDATE') as locale_update`;
    assert.deepEqual(grants, {
      table_select: false,
      table_update: false,
      locale_select: true,
      locale_update: true,
    });
    const updated =
      await tx`update "user" set preferred_locale = 'mk' where id = ${a.user} returning id`;
    assert.deepEqual([...updated], [{ id: a.user }]);
  });
  const { resolveRecipientLocale } =
    await import('../../domain-communications/src/recipient-locale');
  const locale = await drizzle(client, { schema }).transaction(async tx => {
    await tx.execute(sql.raw(`set local role ${role}`));
    await tx.execute(sql`set local row_security = on`);
    await tx.execute(sql`select set_config('app.current_access_tenant_id', ${a.tenant}, true),
      set_config('app.current_tenant_id', ${a.tenant}, true)`);
    return resolveRecipientLocale(tx, a.tenant, a.user);
  });
  assert.equal(locale, 'mk');
  await assert.rejects(
    restricted(client, a.tenant, async tx => {
      await tx`update "user" set name = 'Unexpected change' where id = ${a.user}`;
    }),
    { code: '42501' }
  );
}

async function proveIsolation(client: postgres.Sql, a: Rows, b: Rows) {
  const [posture] =
    await client`select rolsuper, rolbypassrls from pg_roles where rolname = ${runtimeRole}`;
  assert.deepEqual(posture, { rolsuper: false, rolbypassrls: false });
  const tableNames = ['claim_response_requests', 'notification_deliveries'];
  const acl = await client`select relname, relrowsecurity, relforcerowsecurity
    from pg_class where relname in ${client(tableNames)} order by relname`;
  assert.deepEqual(
    [...acl],
    tableNames.map(relname => ({ relname, relrowsecurity: true, relforcerowsecurity: true }))
  );
  await restricted(client, a.tenant, async tx => {
    const deliveries = await tx`select id from notification_deliveries`;
    const requests = await tx`select id from claim_response_requests`;
    assert.deepEqual([...deliveries], [{ id: a.delivery }]);
    assert.deepEqual([...requests], [{ id: a.request }]);
    assert.equal(
      (await tx`update notification_deliveries set attempts=1 where id=${b.delivery} returning id`)
        .length,
      0
    );
    assert.equal(
      (
        await tx`update claim_response_requests set answered_at=now() where id=${b.request} returning id`
      ).length,
      0
    );
    assert.equal(
      (
        await tx`update claim_response_requests set answered_at=now(), answered_by=${b.user},
      answer_kind='member_visible_status_change' where id=${a.request} returning answered_by`
      )[0].answered_by,
      b.user
    );
  });

  const insertDelivery = (
    tenant: string,
    user: string,
    claim: string | null,
    message: string | null
  ) =>
    restricted(client, a.tenant, async tx => {
      const id = randomUUID();
      await tx`insert into notification_deliveries
        (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, subject_message_id, facts)
        values (${id}, ${tenant}, ${id}, 'claim_message_to_member', 'email', ${user}, ${claim}, ${message}, '{}')`;
    });
  const insertRequest = (tenant: string, claim: string, message: string) =>
    restricted(client, a.tenant, async tx => {
      await tx`insert into claim_response_requests (id, tenant_id, claim_id, kind, source_message_id, requested_at)
        values (${randomUUID()}, ${tenant}, ${claim}, 'member_message', ${message}, now())`;
    });
  await assert.rejects(insertDelivery(b.tenant, b.user, b.claim, b.message), { code: '42501' });
  await assert.rejects(insertRequest(b.tenant, b.claim, b.message), { code: '42501' });
  await assert.rejects(insertDelivery(a.tenant, b.user, a.claim, null), { code: '23503' });
  await assert.rejects(insertDelivery(a.tenant, a.user, b.claim, null), { code: '23503' });
  await assert.rejects(insertDelivery(a.tenant, a.user, a.claim, b.message), { code: '23503' });
  await assert.rejects(insertDelivery(a.tenant, a.user, null, a.message), { code: '23502' });
  await assert.rejects(insertRequest(a.tenant, b.claim, b.message), { code: '23503' });
  await assert.rejects(insertRequest(a.tenant, a.claim, b.message), { code: '23503' });
  await assert.rejects(
    restricted(client, a.tenant, async tx => {
      await tx`update claim_response_requests set answer_message_id=${b.message} where id=${a.request}`;
    }),
    { code: '23503' }
  );
  await assert.rejects(
    restricted(client, a.tenant, async tx => {
      await tx`update claim_response_requests set requested_at=now() where id=${a.request}`;
    }),
    { code: '42501' }
  );
  await assert.rejects(
    restricted(client, a.tenant, async tx => {
      await tx`delete from notification_deliveries where id=${a.delivery}`;
    }),
    { code: '42501' }
  );
}

test('WP-11 delivery and request tables enforce the migration privileges and tenant policies', async t => {
  await withNotificationDeliveriesFixture(t, async (client, a, b, legacy) => {
    await t.test('keeps existing and previous-writer claim-message previews unknown', async () => {
      const rows = await restricted(client, legacy.tenant, async tx => {
        return tx`select id, preview_restricted from notifications order by id`;
      });
      assert.deepEqual(
        [...rows],
        [
          { id: legacy.existing, preview_restricted: null },
          { id: legacy.rollout, preview_restricted: null },
        ]
      );
    });
    await t.test('grants locale reads and updates to the runtime role through 0102', async () => {
      await proveLocaleColumnGrant(client, a);
    });
    await t.test('enforces delivery and request isolation', async () => {
      await proveIsolation(client, a, b);
    });
  });
});
