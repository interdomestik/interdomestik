import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { PgDialect } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import { quoteIdentifier, quoteSqlLiteral } from './rls-test-connection';
import { scratchServerMissing, withScratchDatabase } from './pg16/scratch-database';
import { gate } from './wp11-claim-status-rls.fixture';

const runtimeRole = 'interdomestik_runtime_rls';
const role = quoteIdentifier(runtimeRole);
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
const schema = () => ({ migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });

async function install(client: postgres.Sql) {
  const drizzleDb = drizzle(client, { schema: {} });
  const config = schema();
  const migrations = readMigrationFiles(config);
  const target = migrations.pop();
  assert.ok(target);
  assert.ok(
    target.sql.some(statement =>
      statement.includes('notification_deliveries FORCE ROW LEVEL SECURITY')
    )
  );
  await new PgDialect().migrate(migrations, drizzleDb._.session, config);

  await client.unsafe(`grant usage on schema public to ${role}`);
  for (const table of lockTables.slice(0, -1)) {
    await client.unsafe(`grant update (id) on public.${quoteIdentifier(table)} to ${role}`);
  }
  const migration = () =>
    client.begin(async tx => {
      for (const statement of target.sql) await tx.unsafe(statement);
    });
  await assert.rejects(
    migration(),
    /WP-11 requires UPDATE privilege for row locking on public.claim_messages/
  );
  const [rolledBack] =
    await client`select to_regclass('public.notification_deliveries') as delivery_table`;
  assert.equal(rolledBack.delivery_table, null);
  await client.unsafe(`grant update (id) on public.claim_messages to ${role}`);
  await migration();
}

async function seed(client: postgres.Sql, group: string) {
  const tenant = `wp11-${group}`;
  const user = `${tenant}-user`;
  const claim = `${tenant}-claim`;
  const message = `${tenant}-message`;
  const delivery = `${tenant}-delivery`;
  const request = `${tenant}-request`;
  await client`insert into tenants (id, name, legal_name, country_code) values (${tenant}, ${tenant}, ${tenant}, 'MK')`;
  await client`insert into "user" (id, tenant_id, name, email, "emailVerified", role, "createdAt", "updatedAt")
    values (${user}, ${tenant}, 'Test user', ${`${user}@example.test`}, true, 'tenant_admin', now(), now())`;
  await client`insert into claim (id, tenant_id, "userId", title, category, "companyName", case_lifecycle_state)
    values (${claim}, ${tenant}, ${user}, 'Test claim', 'vehicle', 'Test company', 'submitted')`;
  await client`insert into claim_messages (id, tenant_id, claim_id, sender_id, content)
    values (${message}, ${tenant}, ${claim}, ${user}, 'Test message')`;
  await client`insert into notification_deliveries
    (id, tenant_id, idempotency_key, kind, channel, recipient_user_id, claim_id, subject_message_id, facts)
    values (${delivery}, ${tenant}, ${delivery}, 'claim_message_to_member', 'email', ${user}, ${claim}, ${message}, '{"previewRestricted":true}')`;
  await client`insert into claim_response_requests (id, tenant_id, claim_id, kind, requested_at)
    values (${request}, ${tenant}, ${claim}, 'claim_submitted', clock_timestamp())`;
  return { tenant, user, claim, message, delivery, request };
}

function restricted<T>(
  client: postgres.Sql,
  tenantId: string,
  work: (tx: postgres.TransactionSql) => Promise<T>
) {
  return client.begin(async tx => {
    await tx.unsafe(`set local role ${role}`);
    await tx`set local row_security = on`;
    await tx`select set_config('app.current_access_tenant_id', ${tenantId}, true)`;
    return work(tx);
  });
}

type Rows = Awaited<ReturnType<typeof seed>>;

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

async function proveConsumer(client: postgres.Sql, a: Rows) {
  const login = `wp11_${randomUUID().replaceAll('-', '')}`;
  const password = randomUUID();
  const quotedLogin = quoteIdentifier(login);
  const [{ dbName }] = await client`select current_database() as "dbName"`;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  const rlsUrl = new URL(url);
  rlsUrl.username = login;
  rlsUrl.password = password;
  await client.unsafe(`grant select on public."user", public.claim to ${role}`);
  await client.unsafe(`grant insert on public.audit_log to ${role}`);
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
    const { runNotificationDeliveries } =
      await import('../../domain-claims/src/claims/notification-delivery-runner');
    const { claimNotificationDelivery, refundNotificationAttempt } =
      await import('../../domain-communications/src/notification-deliveries/store');
    const authority = mintTenantAuthority({ tenantId: a.tenant, purpose: 'scheduled-work' });

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
    const sendEmail = async (transport: 'smtp' | 'resend') => ({ ok: true as const, transport });
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

test('WP-11 delivery and request tables enforce the migration privileges and tenant policies', async t => {
  const missing = scratchServerMissing('REQUIRE_RLS_INTEGRATION');
  if (missing) return t.skip(missing);

  await withScratchDatabase('wp11_notifications', async client => {
    const [existing] = await client`select 1 from pg_roles where rolname=${runtimeRole}`;
    if (!existing) await client.unsafe(`create role ${role} nologin nosuperuser nobypassrls`);
    try {
      await install(client);
      const a = await seed(client, 'a');
      const b = await seed(client, 'b');
      await proveIsolation(client, a, b);
      await proveConsumer(client, a);
    } finally {
      if (!existing) {
        await client.unsafe(`drop owned by ${role}`);
        await client.unsafe(`drop role ${role}`);
      }
    }
  });
});
