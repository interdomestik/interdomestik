import assert from 'node:assert/strict';
import type postgres from 'postgres';
import { insertUser } from './wp11-appended-tables-rls.proofs';
import { restricted, type Rows } from './wp11-notification-deliveries-rls.fixture';

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

  // A staff answer survives its actor's deletion: the actor goes, the answer time stays.
  const staff = `${b.tenant}-staff`;
  const answeredAt = '2026-11-20T10:00:00.000Z';
  await insertUser(client, staff, b.tenant, 'staff');
  await client`update claim_response_requests set answered_at = ${answeredAt}::timestamptz, answered_by = ${staff},
    answer_kind = 'member_visible_status_change' where id = ${a.request}`;
  await client`delete from "user" where id = ${staff}`;
  const [answer] = await client`select answered_by, answered_at = ${answeredAt}::timestamptz as kept
      from claim_response_requests where id = ${a.request}`;
  assert.deepEqual(answer, { answered_by: null, kept: true });

  // A source message takes its response request and its deliveries, and nothing of its claim.
  const sourceRequest = `${b.tenant}-source-request`;
  const claimDelivery = `${b.tenant}-claim-delivery`;
  await client`insert into claim_response_requests (id, tenant_id, claim_id, kind, source_message_id, requested_at)
    values (${sourceRequest}, ${b.tenant}, ${b.claim}, 'member_message', ${b.message}, now())`;
  await client`insert into notification_deliveries
    (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, facts)
    values (${claimDelivery}, ${b.tenant}, ${claimDelivery}, 'claim_submitted', 'email', ${b.user}, ${b.claim}, '{}')`;
  await client`delete from claim_messages where id = ${b.message}`;
  assert.equal(await count('claim_response_requests', 'source_message_id', b.message), 0);
  assert.equal(await count('notification_deliveries', 'subject_message_id', b.message), 0);
  assert.equal(await count('claim_response_requests', 'claim_id', b.claim), 1);
  assert.equal(await count('notification_deliveries', 'claim_id', b.claim), 1);

  // A claim takes its remaining requests and deliveries.
  await client`delete from claim where id = ${b.claim}`;
  assert.equal(await count('claim_response_requests', 'claim_id', b.claim), 0);
  assert.equal(await count('notification_deliveries', 'claim_id', b.claim), 0);

  // A user takes its locale preference, and its inbox rows take their flags.
  const member = `${a.tenant}-member-two`;
  const memberNotification = `${member}-notification`;
  await insertUser(client, member, a.tenant, 'member');
  await client`insert into user_locale_preferences (user_id, tenant_id, locale)
    values (${member}, ${a.tenant}, 'de')`;
  await client`insert into notifications (id, tenant_id, user_id, type, title, content, action_url)
    values (${memberNotification}, ${a.tenant}, ${member}, 'new_message', 'New Message', 'Update', '/member')`;
  await client`insert into notification_preview_restrictions (notification_id, tenant_id, restricted)
    values (${memberNotification}, ${a.tenant}, true)`;
  await client`delete from "user" where id = ${member}`;
  assert.equal(await count('user_locale_preferences', 'user_id', member), 0);
  assert.equal(await count('notifications', 'id', memberNotification), 0);
  assert.equal(
    await count('notification_preview_restrictions', 'notification_id', memberNotification),
    0
  );
}
