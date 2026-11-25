import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import type postgres from 'postgres';
import type { dispatchNotificationDeliveries } from '../../domain-claims/src/claims/notification-delivery-runner';
import type { TenantAuthority } from '../src/tenant-authority';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';
import { gate } from './wp11-claim-status-rls.fixture';
import {
  proveMalformedFacts,
  proveStaffRouting,
  proveStaleBoundary,
  proveTargetedKick,
} from './wp11-notification-consumer-rls.proofs';
import {
  restricted,
  role,
  runtimeRole,
  withNotificationDeliveriesFixture,
  type Rows,
} from './wp11-notification-deliveries-rls.fixture';

async function provePushRetirement(
  client: postgres.Sql,
  a: Rows,
  authority: TenantAuthority,
  dispatch: typeof dispatchNotificationDeliveries
) {
  const retired = randomUUID();
  const replaced = randomUUID();
  const retiredEndpoint = 'https://push.example.test/retired';
  const replacedEndpoint = 'https://push.example.test/replaced';
  await client`insert into push_subscriptions (id, tenant_id, user_id, endpoint, auth, p256dh, updated_at)
    values (${retired}, ${a.tenant}, ${a.user}, ${retiredEndpoint}, 'auth', 'key', clock_timestamp()),
           (${replaced}, ${a.tenant}, ${a.user}, ${replacedEndpoint}, 'auth', 'key', clock_timestamp())`;
  const ids = [randomUUID(), randomUUID()] as const;
  await client`insert into notification_deliveries
    (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id,
      push_subscription_id, subject_message_id, facts)
    values (${ids[0]}, ${a.tenant}, ${ids[0]}, 'claim_message_to_member', 'push', ${a.user}, ${a.claim},
      ${retired}, ${a.message}, '{"previewRestricted":true}'),
      (${ids[1]}, ${a.tenant}, ${ids[1]}, 'claim_message_to_member', 'push', ${a.user}, ${a.claim},
      ${replaced}, ${a.message}, '{"previewRestricted":true}')`;
  const outcome = await dispatch(
    authority,
    {
      appOrigin: () => 'https://example.test',
      pushConfigured: () => true,
      sendPush: async subscription => {
        const refreshed = subscription.endpoint === replacedEndpoint;
        if (refreshed) {
          await client`update push_subscriptions set updated_at=updated_at
            where id=${replaced}`;
        }
        return {
          ok: false,
          retryable: false,
          ambiguous: false,
          preAcceptance: false,
          code: 'subscription_gone',
          detail: refreshed ? 'web-push 410' : 'web-push 404',
        };
      },
    },
    { ids }
  );
  assert.equal(outcome.failed, 2);
  assert.deepEqual(
    outcome.failures.map(failure => failure.code),
    ['subscription_gone', 'subscription_gone']
  );
  const rows = await restricted(
    client,
    a.tenant,
    async tx => tx`select id from push_subscriptions where id in (${retired}, ${replaced})`
  );
  assert.deepEqual([...rows], [{ id: replaced }]);
}

async function proveConsumer(client: postgres.Sql, a: Rows, b: Rows) {
  const login = `wp11_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID();
  const quotedLogin = quoteIdentifier(login);
  const [{ dbName }] = await client`select current_database() as "dbName"`;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  const rlsUrl = new URL(url);
  rlsUrl.username = login;
  rlsUrl.password = password;
  await client.unsafe(
    `grant select on public."user", public.claim, public.claim_messages to ${role}`
  );
  await client.unsafe(`grant insert on public.audit_log to ${role}`);
  await client.unsafe(`grant select on public.user_notification_preferences to ${role}`);
  await client.unsafe(`grant select, delete on public.push_subscriptions to ${role}`);
  await client.unsafe(
    `create role ${quotedLogin} login noinherit password ${quoteSqlLiteral(password)}`
  );
  const vars = {
    DATABASE_URL: url.toString(),
    DATABASE_URL_RLS: rlsUrl.toString(),
    DB_RLS_ROLE: runtimeRole,
    DB_MAX_CONNECTIONS: '4',
  };
  const previous = Object.fromEntries(Object.keys(vars).map(name => [name, process.env[name]]));
  try {
    await client.unsafe(`grant ${role} to ${quotedLogin}`);
    Object.assign(process.env, vars);
    const { mintTenantAuthority } = await import('../src/tenant-authority');
    const { withTenantAuthority } = await import('../src/tenant-authority-context');
    const { enqueueNotificationDelivery, redriveNotificationDelivery } =
      await import('../../domain-communications/src/notification-deliveries');
    const { dispatchNotificationDeliveries, runNotificationDeliveries } =
      await import('../../domain-claims/src/claims/notification-delivery-runner');
    const { claimNotificationDelivery, refundNotificationAttempt } =
      await import('../../domain-communications/src/notification-deliveries/store');
    const authority = mintTenantAuthority({ tenantId: a.tenant, purpose: 'scheduled-work' });

    await client`update notification_deliveries set next_attempt_at=now()+interval '1 hour'
      where id=${a.delivery}`;
    assert.equal(
      await withTenantAuthority(authority, tx => claimNotificationDelivery(tx, a.tenant)),
      null,
      'A queued delivery must remain unclaimed before next_attempt_at'
    );
    await client`update notification_deliveries set next_attempt_at=created_at
      where id=${a.delivery}`;

    const anotherId = randomUUID();
    const enqueue = {
      id: anotherId,
      tenantId: a.tenant,
      kind: 'claim_submitted',
      channel: 'email',
      claimId: a.claim,
      recipientUserId: a.user,
    } as const;
    assert.equal(
      await withTenantAuthority(authority, tx => enqueueNotificationDelivery(tx, enqueue)),
      anotherId
    );
    assert.equal(
      await withTenantAuthority(authority, tx =>
        enqueueNotificationDelivery(tx, { ...enqueue, id: randomUUID() })
      ),
      null
    );

    const locked = gate();
    const release = gate();
    const first = withTenantAuthority(authority, async tx => {
      const claimed = await claimNotificationDelivery(tx, a.tenant, [a.delivery, anotherId]);
      assert.ok(claimed?.status === 'claimed');
      assert.equal(claimed.row.id, a.delivery);
      locked.open();
      await release.promise;
    });
    let peer: ReturnType<typeof claimNotificationDelivery> | undefined;
    const stopWaiting = new AbortController();
    try {
      await Promise.race([locked.promise, first]);
      peer = withTenantAuthority(authority, tx =>
        claimNotificationDelivery(tx, a.tenant, [a.delivery, anotherId])
      );
      const parallel = await Promise.race([
        peer,
        once(AbortSignal.timeout(4000), 'abort', { signal: stopWaiting.signal }).then(() =>
          assert.fail('Second worker waited for an already locked delivery')
        ),
      ]);
      assert.ok(parallel?.status === 'claimed');
      assert.equal(parallel.row.id, anotherId);
      release.open();
      await first;
    } finally {
      stopWaiting.abort();
      release.open();
      await Promise.allSettled(peer ? [first, peer] : [first]);
    }

    await client`update notification_deliveries set state='claimed', attempts=7,
      lease_until=clock_timestamp()-interval '1 minute' where id=${a.delivery}`;
    const sendEmail = (transport: 'smtp' | 'resend') =>
      Promise.resolve({ ok: true as const, transport });
    const run = await runNotificationDeliveries(authority, {
      appOrigin: () => 'https://example.test',
      emailTransports: () => ['smtp'],
      sendEmail,
    });
    assert.equal(run.sent, 1);
    const [sent] = await restricted(
      client,
      a.tenant,
      async tx =>
        tx`select state, attempts, lease_until from notification_deliveries where id=${a.delivery}`
    );
    assert.deepEqual(sent, { state: 'sent', attempts: 8, lease_until: null });

    await client`update notification_deliveries set state='claimed', attempts=7, transport='smtp',
      lease_until=clock_timestamp()-interval '1 minute' where id=${anotherId}`;
    await withTenantAuthority(authority, async tx => {
      const claim = await claimNotificationDelivery(tx, a.tenant, [anotherId]);
      assert.ok(claim?.status === 'claimed');
      assert.equal(claim.row.attempts, 8);
      assert.ok(await refundNotificationAttempt(tx, claim.row));
    });
    const [refunded] = await restricted(
      client,
      a.tenant,
      async tx =>
        tx`select state, attempts, lease_until, transport from notification_deliveries where id=${anotherId}`
    );
    assert.deepEqual(refunded, {
      state: 'queued',
      attempts: 7,
      lease_until: null,
      transport: 'smtp',
    });

    await client`update notification_deliveries set state='failed', attempts=8,
      terminal_at=clock_timestamp(), last_error_code='smtp_rejected' where id=${anotherId}`;
    const admin = mintTenantAuthority({
      tenantId: a.tenant,
      purpose: 'session',
      principal: { userId: a.user, role: 'tenant_admin', branchId: null, agentId: null },
    });
    const redrive = () =>
      withTenantAuthority(admin, tx =>
        redriveNotificationDelivery(tx, anotherId, { actorId: a.user, actorRole: 'tenant_admin' })
      );
    const outcomes = await Promise.all([redrive(), redrive()]);
    assert.equal(outcomes.filter(Boolean).length, 1);
    const [redriven] = await client`select state, attempts, transport, terminal_at
      from notification_deliveries where id=${anotherId}`;
    assert.deepEqual(redriven, {
      state: 'queued',
      attempts: 0,
      transport: 'smtp',
      terminal_at: null,
    });
    const audits = await client`select actor_id from audit_log
      where entity_id=${anotherId} and action='notification.delivery_redriven'`;
    assert.deepEqual([...audits], [{ actor_id: a.user }]);

    await proveTargetedKick(client, a, anotherId, admin, dispatchNotificationDeliveries);
    await provePushRetirement(client, a, authority, dispatchNotificationDeliveries);
    await proveStaleBoundary(client, a, authority);
    await proveStaffRouting(client, a, b, authority, dispatchNotificationDeliveries);
    await proveMalformedFacts(client, a, authority, dispatchNotificationDeliveries);
  } finally {
    const pools = globalThis as typeof globalThis & {
      queryClientAdmin?: postgres.Sql;
      queryClientRls?: postgres.Sql;
    };
    await Promise.all(
      [...new Set([pools.queryClientAdmin, pools.queryClientRls])].map(pool =>
        pool?.end({ timeout: 1 })
      )
    );
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await client.unsafe(`drop role ${quotedLogin}`);
  }
}

test('WP-11 delivery consumer schedules, kicks, checks expiry and routing, retires push, refunds and re-drives under the restricted role', async t => {
  await withNotificationDeliveriesFixture(t, proveConsumer);
});
