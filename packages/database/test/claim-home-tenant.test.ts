import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { delegateClaimHomeTenantRead } from '../src/claim-home-tenant';
import { dbAdmin } from '../src/db';
import { readTenantAuthority } from '../src/tenant-authority';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';

function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: Array<{ columns: unknown; where: unknown }> = [];
  t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call = { columns, where: undefined as unknown };
    calls.push(call);
    const chain = {
      from: () => chain,
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      limit: () => Promise.resolve(rows),
    };
    return chain;
  }) as unknown as typeof dbAdmin.select);
  return calls;
}

const operator = () =>
  mintTestTenantAuthority('tenant_ks', { userId: 'staff-1', role: 'tenant_admin' });

test('a claim homed in the caller tenant reads under the caller authority', async t => {
  mockSelect(t, [{ tenantId: 'tenant_ks' }]);
  const authority = operator();
  assert.equal(await delegateClaimHomeTenantRead(authority, 'claim-1'), authority);
});

test('a claim transferred to the caller tenant delegates the caller principal to its home tenant', async t => {
  const calls = mockSelect(t, [{ tenantId: 'tenant_mk' }]);

  const delegated = await delegateClaimHomeTenantRead(operator(), ' claim-1 ');

  const descriptor = readTenantAuthority(delegated!);
  assert.equal(descriptor.tenantId, 'tenant_mk');
  assert.equal(descriptor.accessTenantId, 'tenant_mk');
  assert.equal(descriptor.purpose, 'claim-home-read');
  assert.equal(descriptor.principal?.userId, 'staff-1');
  assert.equal(descriptor.principal?.role, 'tenant_admin');
  assert.deepEqual(Object.keys(calls[0].columns as object), ['tenantId']);
  const compiled = new PgDialect().sqlToQuery(calls[0].where as never);
  assert.equal(
    compiled.sql,
    '("claim"."id" = $1 and ("claim"."tenant_id" = $2 or "claim"."access_tenant_id" = $3))'
  );
  assert.deepEqual(compiled.params, ['claim-1', 'tenant_ks', 'tenant_ks']);
});

test('a claim that is neither homed in nor transferred to the caller tenant yields nothing', async t => {
  mockSelect(t, []);
  assert.equal(await delegateClaimHomeTenantRead(operator(), 'claim-foreign'), null);
});

test('a principal-less authority or an empty claim id never queries', async t => {
  const calls = mockSelect(t, [{ tenantId: 'tenant_mk' }]);
  assert.equal(
    await delegateClaimHomeTenantRead(mintTestTenantAuthority('tenant_ks'), 'claim-1'),
    null
  );
  assert.equal(await delegateClaimHomeTenantRead(operator(), '  '), null);
  assert.equal(calls.length, 0);
});

test('a forged authority is refused before any query', async t => {
  const calls = mockSelect(t, [{ tenantId: 'tenant_mk' }]);
  await assert.rejects(delegateClaimHomeTenantRead({} as never, 'claim-1'));
  assert.equal(calls.length, 0);
});
