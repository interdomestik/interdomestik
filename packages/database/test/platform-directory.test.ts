import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  MAX_PLATFORM_TENANTS,
  listActiveTenantDirectory,
  listTenantIdsForPlatformAggregate,
  readActiveTenantId,
  resolveBranchOwner,
} from '../src/platform-directory';

type Captured = {
  columns: unknown;
  where: unknown;
  orderBy: unknown;
  limit: unknown;
};

function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: Captured[] = [];
  const method = t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call: Captured = { columns, where: undefined, orderBy: undefined, limit: undefined };
    calls.push(call);
    const chain = {
      from: () => chain,
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

test('platform aggregate tenant ids are ordered, projected to id only and bounded at 500', async t => {
  const { calls } = mockSelect(t, [{ id: 'tenant-a' }, { id: 'tenant-b' }]);

  assert.deepEqual(await listTenantIdsForPlatformAggregate(), ['tenant-a', 'tenant-b']);

  assert.equal(MAX_PLATFORM_TENANTS, 500);
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object), ['id']);
  assert.equal(calls[0].where, undefined, 'the id list is unfiltered but bounded');
  assert.equal(calls[0].limit, 501);
  const orderBy = calls[0].orderBy as unknown[];
  assert.equal(orderBy.length, 1);
  assert.equal(compile(orderBy[0]).sql, '"tenants"."id" asc');
});

test('platform aggregate accepts exactly 500 tenants and fails closed above that', async t => {
  const exactly500 = Array.from({ length: 500 }, (_, i) => ({ id: `tenant-${i}` }));
  const ok = mockSelect(t, exactly500);
  const ids = await listTenantIdsForPlatformAggregate();
  assert.equal(ids.length, 500);
  ok.method.mock.restore();

  mockSelect(t, [...exactly500, { id: 'tenant-500' }]);
  await assert.rejects(listTenantIdsForPlatformAggregate(), /exceeds 500 tenants/);
});

test('platform aggregate returns an empty list for no tenants', async t => {
  mockSelect(t, []);
  assert.deepEqual(await listTenantIdsForPlatformAggregate(), []);
});

test('active tenant id check requires an exact id and is_active, limited to two rows', async t => {
  const { calls } = mockSelect(t, [{ id: 'tenant-mk' }]);

  assert.equal(await readActiveTenantId('  tenant-mk  '), 'tenant-mk');

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object), ['id']);
  assert.equal(calls[0].limit, 2);
  const compiled = compile(calls[0].where);
  assert.match(compiled.sql, /"tenants"\."id" = \$1/);
  assert.match(compiled.sql, /"tenants"\."is_active" = \$2/);
  assert.deepEqual(
    compiled.params,
    ['tenant-mk', true],
    'id is trimmed; only active tenants match'
  );
});

test('active tenant id check returns null for no row, an ambiguous result, and blank ids', async t => {
  const none = mockSelect(t, []);
  assert.equal(await readActiveTenantId('tenant-x'), null);
  none.method.mock.restore();

  const ambiguous = mockSelect(t, [{ id: 'tenant-x' }, { id: 'tenant-x' }]);
  assert.equal(await readActiveTenantId('tenant-x'), null);
  ambiguous.method.mock.restore();

  const blank = mockSelect(t, [{ id: 'never' }]);
  assert.equal(await readActiveTenantId(''), null);
  assert.equal(await readActiveTenantId('   '), null);
  assert.equal(blank.calls.length, 0, 'blank ids must not query');
});

test('active tenant directory filters active, excludes one tenant, orders by name, bounded', async t => {
  const rows = [
    { id: 'tenant-al', name: 'AL', countryCode: 'AL' },
    { id: 'tenant-mk', name: 'MK', countryCode: 'MK' },
  ];
  const { calls } = mockSelect(t, rows);

  assert.deepEqual(await listActiveTenantDirectory({ excludeTenantId: 'tenant-ks' }), rows);

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object).sort(), ['countryCode', 'id', 'name']);
  assert.equal(calls[0].limit, 500);
  const compiled = compile(calls[0].where);
  assert.match(compiled.sql, /"tenants"\."is_active" = \$1/);
  assert.match(compiled.sql, /"tenants"\."id" <> \$2/);
  assert.deepEqual(compiled.params, [true, 'tenant-ks']);
  const orderBy = calls[0].orderBy as unknown[];
  assert.equal(orderBy.length, 1);
  assert.equal(compile(orderBy[0]).sql, '"tenants"."name" asc');
});

test('branch owner resolves by id or code, limited to two rows, and returns the single match', async t => {
  const { calls } = mockSelect(t, [{ branchId: 'branch-1', tenantId: 'tenant-ks' }]);

  assert.deepEqual(await resolveBranchOwner(' branch_ks_a '), {
    branchId: 'branch-1',
    tenantId: 'tenant-ks',
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object).sort(), ['branchId', 'tenantId']);
  assert.equal(calls[0].limit, 2);
  const compiled = compile(calls[0].where);
  assert.match(compiled.sql, /"branches"\."id" = \$1/);
  assert.match(compiled.sql, /"branches"\."code" = \$2/);
  assert.match(compiled.sql, / or /);
  assert.deepEqual(compiled.params, ['branch_ks_a', 'branch_ks_a']);
});

test('branch owner resolves to null when unknown, ambiguous across tenants, or blank', async t => {
  const none = mockSelect(t, []);
  assert.equal(await resolveBranchOwner('missing'), null);
  none.method.mock.restore();

  const ambiguous = mockSelect(t, [
    { branchId: 'branch-1', tenantId: 'tenant-ks' },
    { branchId: 'branch-2', tenantId: 'tenant-mk' },
  ]);
  assert.equal(await resolveBranchOwner('shared-code'), null);
  ambiguous.method.mock.restore();

  const blank = mockSelect(t, [{ branchId: 'branch-1', tenantId: 'tenant-ks' }]);
  assert.equal(await resolveBranchOwner(''), null);
  assert.equal(await resolveBranchOwner('   '), null);
  assert.equal(blank.calls.length, 0, 'blank ids must not query');
});
