import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import { tenants } from '../src/schema/tenants';
import { listTenantIdsForScheduledWork, MAX_SCHEDULED_TENANTS } from '../src/scheduled-tenant-work';

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
