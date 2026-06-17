import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';
import { pgTable, PgDialect, text } from 'drizzle-orm/pg-core';

import { withAccessTenant } from '../src/tenant-security';

const accessScopedRows = pgTable('access_scoped_rows', {
  accessTenantId: text('access_tenant_id').notNull(),
  id: text('id').notNull(),
});

test('withAccessTenant scopes by the explicit accessTenantId column', () => {
  const predicate = withAccessTenant(
    { accessTenantId: 'tenant_access' },
    accessScopedRows,
    eq(accessScopedRows.id, 'row-1')
  );
  const query = new PgDialect().sqlToQuery(predicate);

  assert.equal(
    query.sql,
    '("access_scoped_rows"."access_tenant_id" = $1 and "access_scoped_rows"."id" = $2)'
  );
  assert.deepEqual(query.params, ['tenant_access', 'row-1']);
});

test('withAccessTenant can build only the access tenant predicate', () => {
  const predicate = withAccessTenant({ accessTenantId: 'tenant_access' }, accessScopedRows);
  const query = new PgDialect().sqlToQuery(predicate);

  assert.equal(query.sql, '"access_scoped_rows"."access_tenant_id" = $1');
  assert.deepEqual(query.params, ['tenant_access']);
});

test('withAccessTenant rejects blank access tenant scope', () => {
  assert.throws(
    () => withAccessTenant({ accessTenantId: '  ' }, accessScopedRows),
    /withAccessTenant requires a non-empty accessTenantId/u
  );
});
