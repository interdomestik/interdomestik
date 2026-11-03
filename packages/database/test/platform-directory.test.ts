import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  MAX_PLATFORM_TENANTS,
  delegateSuperAdminBranchOwner,
  delegateSuperAdminTenant,
  listPublicStatisticsWork,
  listSuperAdminAggregateWork,
  listSuperAdminTenantOptions,
  listTenantIdsForPlatformAggregate,
  readActiveTenantId,
  resolveBranchOwner,
} from '../src/platform-directory';
import { mintTenantAuthority, readTenantAuthority } from '../src/tenant-authority';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';

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

const superAdmin = () =>
  mintTenantAuthority({
    tenantId: 'tenant-home',
    purpose: 'session',
    principal: { userId: 'sa-1', role: 'super_admin', branchId: null, agentId: null },
  });

test('super-admin producers refuse any actor that is not a super_admin session', async t => {
  const { method } = mockSelect(t, [{ id: 'tenant-a' }]);
  const nonSuper = [
    mintTestTenantAuthority('tenant-home', { userId: 'admin-1', role: 'tenant_admin' }),
    mintTestTenantAuthority('tenant-home'),
    mintTenantAuthority({ tenantId: 'tenant-home', purpose: 'scheduled-work' }),
    // A token minted for another purpose cannot be upgraded by claiming the role.
    mintTenantAuthority({
      tenantId: 'tenant-home',
      purpose: 'public-token',
      principal: { userId: 'x', role: 'super_admin', branchId: null, agentId: null },
    }),
  ];
  for (const actor of nonSuper) {
    await assert.rejects(listSuperAdminAggregateWork(actor), /super_admin session authority/u);
    await assert.rejects(delegateSuperAdminTenant(actor, 'tenant-a'), /super_admin session/u);
    await assert.rejects(delegateSuperAdminBranchOwner(actor, 'b-1'), /super_admin session/u);
    await assert.rejects(listSuperAdminTenantOptions(actor), /super_admin session/u);
  }
  assert.equal(method.mock.callCount(), 0, 'no directory read happens before the actor check');
});

test('super-admin aggregate work keeps the super admin principal on one authority per tenant', async t => {
  mockSelect(t, [{ id: 'tenant-a' }, { id: 'tenant-b' }]);
  const work = await listSuperAdminAggregateWork(superAdmin());
  assert.deepEqual(
    work.map(item => item.tenantId),
    ['tenant-a', 'tenant-b']
  );
  for (const item of work) {
    const descriptor = readTenantAuthority(item.authority);
    assert.equal(descriptor.tenantId, item.tenantId);
    assert.equal(descriptor.accessTenantId, item.tenantId);
    assert.equal(descriptor.purpose, 'platform-aggregate');
    assert.equal(descriptor.principal?.userId, 'sa-1');
    assert.equal(descriptor.principal?.role, 'super_admin');
  }
});

test('super-admin tenant delegation is scoped to one active tenant and refuses unknown ones', async t => {
  const { calls } = mockSelect(t, [{ id: 'tenant-target' }]);
  const delegated = await delegateSuperAdminTenant(superAdmin(), ' tenant-target ');
  assert.ok(delegated);
  const descriptor = readTenantAuthority(delegated);
  assert.equal(descriptor.tenantId, 'tenant-target');
  assert.equal(descriptor.purpose, 'super-admin-delegation');
  assert.equal(descriptor.principal?.role, 'super_admin');
  assert.equal(calls.length, 1, 'the target is checked against the active-tenant directory');

  t.mock.restoreAll();
  mockSelect(t, []);
  assert.equal(await delegateSuperAdminTenant(superAdmin(), 'tenant-gone'), null);
});

test('super-admin branch delegation scopes the authority to the branch owner tenant', async t => {
  mockSelect(t, [{ branchId: 'branch-1', tenantId: 'tenant-owner' }]);
  const owner = await delegateSuperAdminBranchOwner(superAdmin(), 'KS-01');
  assert.equal(owner?.branchId, 'branch-1');
  assert.equal(owner?.tenantId, 'tenant-owner');
  assert.equal(readTenantAuthority(owner!.authority).tenantId, 'tenant-owner');
  assert.equal(Object.isFrozen(owner), true);

  t.mock.restoreAll();
  mockSelect(t, [
    { branchId: 'branch-1', tenantId: 'tenant-a' },
    { branchId: 'branch-2', tenantId: 'tenant-b' },
  ]);
  assert.equal(await delegateSuperAdminBranchOwner(superAdmin(), 'SHARED'), null);
});

test('public statistics work carries no principal', async t => {
  mockSelect(t, [{ id: 'tenant-a' }]);
  const [item] = await listPublicStatisticsWork();
  const descriptor = readTenantAuthority(item.authority);
  assert.equal(descriptor.tenantId, 'tenant-a');
  assert.equal(descriptor.purpose, 'platform-aggregate');
  assert.equal(descriptor.principal, null);
});

test('super-admin tenant options project active tenants to id, name and country, bounded at 500', async t => {
  const { calls } = mockSelect(t, [{ id: 'tenant-a', name: 'Alpha', countryCode: 'XK' }]);

  const options = await listSuperAdminTenantOptions(superAdmin());

  assert.deepEqual(options, [{ id: 'tenant-a', name: 'Alpha', countryCode: 'XK' }]);
  assert.ok(Object.isFrozen(options[0]));
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object), ['id', 'name', 'countryCode']);
  const where = compile(calls[0].where);
  assert.equal(where.sql, '"tenants"."is_active" = $1');
  assert.deepEqual(where.params, [true]);
  assert.equal(calls[0].limit, 501);
  assert.equal(compile((calls[0].orderBy as unknown[])[0]).sql, '"tenants"."name" asc');
});

test('super-admin tenant options fail closed above 500 active tenants', async t => {
  const rows = Array.from({ length: 501 }, (_, i) => ({
    id: `t-${i}`,
    name: `T${i}`,
    countryCode: 'XK',
  }));
  mockSelect(t, rows);
  await assert.rejects(listSuperAdminTenantOptions(superAdmin()), /exceeds 500 tenants/);
});
