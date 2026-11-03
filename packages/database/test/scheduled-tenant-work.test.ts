import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import { tenants } from '../src/schema/tenants';
import { admitCronRequest, mintIngressCapability } from '../src/ingress-capability';
import {
  authorizeInngestEventTenant,
  listScheduledTenantWork,
  listTenantIdsForScheduledWork,
  MAX_SCHEDULED_TENANTS,
} from '../src/scheduled-tenant-work';
import { readTenantAuthority } from '../src/tenant-authority';

type Captured = {
  columns: unknown;
  from: unknown;
  limit: unknown;
  orderBy: unknown[] | undefined;
  where: unknown;
};

function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: Captured[] = [];
  const method = t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call: Captured = {
      columns,
      from: undefined,
      limit: undefined,
      orderBy: undefined,
      where: undefined,
    };
    calls.push(call);
    const chain = {
      from: (table: unknown) => {
        call.from = table;
        return chain;
      },
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      orderBy: (...orderBy: unknown[]) => {
        call.orderBy = orderBy;
        return chain;
      },
      limit: (limit: unknown) => {
        call.limit = limit;
        return Promise.resolve(rows);
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.select);
  return { calls, method };
}

function compile(fragment: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(fragment as Parameters<typeof dialect.sqlToQuery>[0]);
}

function tenantRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `tenant-${String(index).padStart(4, '0')}`,
  }));
}

test('scheduled tenant work reads only tenant ids, ordered by id, with a bounded limit', async t => {
  const { calls, method } = mockSelect(t, [{ id: 'tenant-a' }, { id: 'tenant-b' }]);

  const ids = await listTenantIdsForScheduledWork();

  assert.deepEqual(ids, ['tenant-a', 'tenant-b']);
  assert.equal(method.mock.callCount(), 1);
  assert.equal(calls.length, 1);

  const [call] = calls;
  assert.deepEqual(Object.keys(call.columns as object), ['id']);
  assert.equal((call.columns as { id: unknown }).id, tenants.id);
  assert.equal(call.from, tenants);
  assert.equal(call.where, undefined, 'tenant enumeration must not filter or widen by predicate');

  assert.equal(call.orderBy?.length, 1);
  const order = compile(call.orderBy?.[0]);
  assert.equal(order.sql, '"tenants"."id" asc');
  assert.deepEqual(order.params, []);

  assert.equal(MAX_SCHEDULED_TENANTS, 500);
  assert.equal(call.limit, 501);
});

test('scheduled tenant work returns an empty list when there are no tenants', async t => {
  mockSelect(t, []);

  assert.deepEqual(await listTenantIdsForScheduledWork(), []);
});

test('scheduled tenant work returns exactly the maximum number of tenants', async t => {
  mockSelect(t, tenantRows(MAX_SCHEDULED_TENANTS));

  const ids = await listTenantIdsForScheduledWork();

  assert.equal(ids.length, 500);
  assert.equal(ids[0], 'tenant-0000');
  assert.equal(ids[499], 'tenant-0499');
});

test('scheduled tenant work fails closed when more than the maximum number of tenants exist', async t => {
  mockSelect(t, tenantRows(MAX_SCHEDULED_TENANTS + 1));

  await assert.rejects(listTenantIdsForScheduledWork(), /exceeds 500 tenants/u);
});

test('the scheduled-work producer mints one system authority per tenant for an admitted run', async t => {
  mockSelect(t, [{ id: 'tenant-a' }, { id: 'tenant-b' }]);

  const work = await listScheduledTenantWork(mintIngressCapability('inngest'));

  assert.deepEqual(
    work.map(item => item.tenantId),
    ['tenant-a', 'tenant-b']
  );
  for (const item of work) {
    const descriptor = readTenantAuthority(item.authority);
    assert.equal(descriptor.tenantId, item.tenantId);
    assert.equal(descriptor.accessTenantId, item.tenantId);
    assert.equal(descriptor.purpose, 'scheduled-work');
    assert.equal(descriptor.principal, null);
    assert.equal(Object.isFrozen(item), true);
  }
  assert.notEqual(work[0].authority, work[1].authority);
});

test('the scheduled-work producer refuses a look-alike or wrong-kind ingress before any query', async t => {
  const { method } = mockSelect(t, [{ id: 'tenant-a' }]);
  const lookAlike = Object.freeze(Object.create(null)) as ReturnType<
    typeof mintIngressCapability<'cron'>
  >;

  await assert.rejects(listScheduledTenantWork(lookAlike), /Unrecognized ingress capability/u);
  await assert.rejects(
    listScheduledTenantWork(
      mintIngressCapability('paddle-delivery') as unknown as ReturnType<
        typeof mintIngressCapability<'cron'>
      >
    ),
    /Unrecognized ingress capability/u
  );
  assert.equal(method.mock.callCount(), 0);
});

test('cron admission requires the configured secret as an exact bearer value', t => {
  const previous = process.env.CRON_SECRET;
  t.after(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });

  delete process.env.CRON_SECRET;
  assert.equal(admitCronRequest('Bearer '), null, 'an unset secret never admits');
  process.env.CRON_SECRET = '   ';
  assert.equal(admitCronRequest('Bearer    '), null, 'a blank secret never admits');

  process.env.CRON_SECRET = 'cron-test-secret';
  assert.equal(admitCronRequest(null), null);
  assert.equal(admitCronRequest(undefined), null);
  assert.equal(admitCronRequest('cron-test-secret'), null);
  assert.equal(admitCronRequest('Bearer cron-test-secre'), null);
  assert.equal(admitCronRequest('Bearer cron-test-secret '), null);
  assert.equal(admitCronRequest('bearer cron-test-secret'), null);
  assert.notEqual(admitCronRequest('Bearer cron-test-secret'), null);
});

test('an admitted cron run reaches the scheduled-work producer; an expired capability does not', async t => {
  const previous = process.env.CRON_SECRET;
  t.after(() => {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  });
  process.env.CRON_SECRET = 'cron-test-secret';
  mockSelect(t, [{ id: 'tenant-a' }]);

  const admitted = admitCronRequest('Bearer cron-test-secret');
  assert.ok(admitted);
  assert.equal((await listScheduledTenantWork(admitted)).length, 1);

  const expired = mintIngressCapability('cron', Date.now() - 60 * 60_000);
  await assert.rejects(listScheduledTenantWork(expired), /Expired ingress capability/u);
});

test('an Inngest event authority is minted only for an existing tenant the event names', async t => {
  const { calls } = mockSelect(t, [{ id: 'tenant_ks' }]);
  const authority = await authorizeInngestEventTenant(
    mintIngressCapability('inngest'),
    ' tenant_ks '
  );
  const descriptor = readTenantAuthority(authority);
  assert.equal(descriptor.tenantId, 'tenant_ks');
  assert.equal(descriptor.purpose, 'scheduled-work');
  assert.equal(descriptor.principal, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].from, tenants);
  assert.equal(calls[0].limit, 1);
  const where = compile(calls[0].where);
  assert.deepEqual(where.params, ['tenant_ks']);
});

test('an Inngest event authority fails closed for a missing tenant, a blank tenant or another ingress', async t => {
  mockSelect(t, []);
  await assert.rejects(
    authorizeInngestEventTenant(mintIngressCapability('inngest'), 'tenant_gone'),
    /existing tenant/
  );
  await assert.rejects(
    authorizeInngestEventTenant(mintIngressCapability('inngest'), '  '),
    /event tenant/
  );
  await assert.rejects(
    authorizeInngestEventTenant(mintIngressCapability('cron') as never, 'tenant_ks'),
    /Unrecognized ingress capability/
  );
  await assert.rejects(
    authorizeInngestEventTenant(Object.freeze(Object.create(null)) as never, 'tenant_ks'),
    /Unrecognized ingress capability/
  );
});
