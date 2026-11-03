import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import { authorizePublicSiteTenant } from '../src/public-site-tenant';
import { readTenantAuthority } from '../src/tenant-authority';

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

test('public site producer mints a principal-less public-site authority for an active tenant', async t => {
  const calls = mockSelect(t, [{ id: 'tenant_ks' }]);

  const authority = await authorizePublicSiteTenant(' tenant_ks ');

  const descriptor = readTenantAuthority(authority!);
  assert.equal(descriptor.tenantId, 'tenant_ks');
  assert.equal(descriptor.accessTenantId, 'tenant_ks');
  assert.equal(descriptor.purpose, 'public-site');
  assert.equal(descriptor.principal, null);
  assert.deepEqual(Object.keys(calls[0].columns as object), ['id']);
  const compiled = new PgDialect().sqlToQuery(calls[0].where as never);
  assert.equal(compiled.sql, '("tenants"."id" = $1 and "tenants"."is_active" = $2)');
  assert.deepEqual(compiled.params, ['tenant_ks', true]);
});

test('public site producer mints nothing for an unknown, inactive or empty tenant', async t => {
  const calls = mockSelect(t, []);
  assert.equal(await authorizePublicSiteTenant('tenant_gone'), null);
  assert.equal(await authorizePublicSiteTenant('  '), null);
  assert.equal(calls.length, 1, 'an empty tenant never queries');
});
