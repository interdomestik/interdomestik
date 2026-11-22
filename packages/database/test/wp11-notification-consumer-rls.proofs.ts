import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import type { dispatchNotificationDeliveries } from '../../domain-claims/src/claims/notification-delivery-runner';
import type { TenantAuthority } from '../src/tenant-authority';
import { restricted, type Rows } from './wp11-notification-deliveries-rls.fixture';

export async function proveTargetedKick(
  client: postgres.Sql,
  a: Rows,
  unrelatedId: string,
  authority: TenantAuthority,
  dispatch: typeof dispatchNotificationDeliveries
) {
  const id = randomUUID();
  await client`update notification_deliveries
    set next_attempt_at=clock_timestamp()-interval '2 minutes' where id=${unrelatedId}`;
  await client`insert into notification_deliveries
    (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, facts)
    values (${id}, ${a.tenant}, ${id}, 'claim_submitted', 'email', ${a.user}, ${a.claim}, '{}')`;
  const sends: string[] = [];
  const kicked = await dispatch(
    authority,
    {
      appOrigin: () => 'https://example.test',
      emailTransports: () => ['smtp'],
      sendEmail: (transport, _to, _payload, options) => {
        sends.push(options.idempotencyKey);
        return Promise.resolve({ ok: true, transport });
      },
    },
    { ids: [id] }
  );

  assert.equal(kicked.sent, 1);
  assert.deepEqual(sends, [id]);
  const rows = await restricted(
    client,
    a.tenant,
    async tx =>
      tx`select id, state, attempts from notification_deliveries where id in (${id}, ${unrelatedId})`
  );
  assert.deepEqual(
    rows.find(row => row.id === id),
    { id, state: 'sent', attempts: 1 }
  );
  assert.deepEqual(
    rows.find(row => row.id === unrelatedId),
    {
      id: unrelatedId,
      state: 'queued',
      attempts: 0,
    }
  );
}

export async function proveStaleBoundary(
  client: postgres.Sql,
  a: Rows,
  authority: TenantAuthority
) {
  const { withTenantAuthority } = await import('../src/tenant-authority-context');
  const { claimNotificationDelivery, finishNotificationDelivery, writeNotificationTransport } =
    await import('../../domain-communications/src/notification-deliveries/store');
  const liveId = randomUUID();
  const expiredId = randomUUID();
  await client`insert into notification_deliveries
    (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, created_at, attempts)
    values (${liveId}, ${a.tenant}, ${liveId}, 'claim_submitted', 'email', ${a.user}, ${a.claim},
      clock_timestamp() - interval '72 hours' + interval '1 minute', 7),
      (${expiredId}, ${a.tenant}, ${expiredId}, 'claim_submitted', 'email', ${a.user}, ${a.claim},
      clock_timestamp() - interval '72 hours' - interval '1 minute', 7)`;

  await withTenantAuthority(authority, async tx => {
    const expired = await claimNotificationDelivery(tx, a.tenant, [expiredId]);
    assert.ok(expired?.status === 'claimed');
    assert.equal(
      await finishNotificationDelivery(tx, expired.row, { skip: 'stale' }, null, null, ['smtp']),
      'skipped'
    );

    const live = await claimNotificationDelivery(tx, a.tenant, [liveId]);
    assert.ok(live?.status === 'claimed');
    const write = await writeNotificationTransport(tx, live.row, 'smtp', 10_000, () => 0);
    assert.equal(typeof write, 'object');
    assert.equal(
      await finishNotificationDelivery(tx, live.row, { skip: 'stale' }, null, null, ['smtp']),
      'queued'
    );
  });

  const rows = await restricted(
    client,
    a.tenant,
    async tx => tx`select id, state, lease_until, transport, attempts, skip_reason,
      terminal_at is not null as terminal from notification_deliveries
      where id in (${liveId}, ${expiredId})`
  );
  assert.deepEqual(
    rows.find(row => row.id === liveId),
    {
      id: liveId,
      state: 'queued',
      attempts: 7,
      lease_until: null,
      transport: null,
      skip_reason: null,
      terminal: false,
    }
  );
  assert.deepEqual(
    rows.find(row => row.id === expiredId),
    {
      id: expiredId,
      state: 'skipped',
      attempts: 8,
      lease_until: null,
      transport: null,
      skip_reason: 'stale',
      terminal: true,
    }
  );
}

export async function proveStaffRouting(
  client: postgres.Sql,
  a: Rows,
  b: Rows,
  authority: TenantAuthority,
  dispatch: typeof dispatchNotificationDeliveries
) {
  const homeBranch = randomUUID();
  const otherBranch = randomUUID();
  const scoped = randomUUID();
  const assignee = randomUUID();
  const scopedEmail = `${scoped}@example.test`;
  const assigneeEmail = `${assignee}@example.test`;
  await client`insert into branches (id, tenant_id, name, slug)
    values (${homeBranch}, ${a.tenant}, 'Home branch', ${homeBranch}),
           (${otherBranch}, ${a.tenant}, 'Other branch', ${otherBranch})`;
  await client`insert into "user" (id, tenant_id, name, email, "emailVerified", role, branch_id, "createdAt", "updatedAt")
    values (${scoped}, ${a.tenant}, 'Scoped staff', ${scopedEmail}, false, 'staff', ${homeBranch}, now(), now()),
           (${assignee}, ${a.tenant}, 'Out of scope assignee', ${assigneeEmail}, true, 'staff', ${otherBranch}, now(), now())`;
  await client`update "user" set role='staff' where id=${b.user}`;
  await client`update claim set branch_id=${homeBranch}, "staffId"=${assignee} where id=${a.claim}`;

  const enqueue = async (recipient: string) => {
    const id = randomUUID();
    await client`insert into notification_deliveries
      (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, facts)
      values (${id}, ${a.tenant}, ${id}, 'staff_claim_submitted', 'email', ${recipient}, ${a.claim}, '{}')`;
    return id;
  };
  const sends: string[] = [];
  const deps = {
    appOrigin: () => 'https://example.test',
    emailTransports: () => ['smtp'] as const,
    sendEmail: (transport: 'smtp' | 'resend', to: string) => {
      sends.push(to);
      return Promise.resolve({ ok: true as const, transport });
    },
  };
  const adminId = await enqueue(a.user);
  const scopedId = await enqueue(scoped);
  const assigneeId = await enqueue(assignee);
  const routings = await dispatch(authority, deps, { ids: [adminId, scopedId, assigneeId] });
  assert.equal(routings.skipped, 3);
  assert.deepEqual(sends, []);
  const skipped = await restricted(
    client,
    a.tenant,
    async tx => tx`select (id = ${scopedId}) as scoped, skip_reason from notification_deliveries
      where id in (${adminId}, ${scopedId}, ${assigneeId}) order by scoped`
  );
  assert.deepEqual(
    [...skipped],
    [
      { scoped: false, skip_reason: 'recipient_out_of_scope' },
      { scoped: false, skip_reason: 'recipient_out_of_scope' },
      { scoped: true, skip_reason: 'email_unverified' },
    ]
  );

  await client`update "user" set "emailVerified"=true where id=${scoped}`;
  const staff = await dispatch(authority, deps, { ids: [await enqueue(scoped)] });
  assert.equal(staff.sent, 1);

  await client`update "user" set role='member' where id=${scoped}`;
  await client`update claim set "staffId"=null where id=${a.claim}`;
  const fallback = await dispatch(authority, deps, { ids: [await enqueue(a.user)] });
  assert.equal(fallback.sent, 1);
  assert.deepEqual(sends, [`${scoped}@example.test`, `${a.user}@example.test`]);
}
