import { describe, expect, it } from 'vitest';
import { pgTable, PgDialect, text } from 'drizzle-orm/pg-core';

import { matchesAccessTenant } from './access-tenant-predicate';

const table = pgTable('claims', {
  accessTenantId: text('access_tenant_id'),
  tenantId: text('tenant_id').notNull(),
});

describe('matchesAccessTenant', () => {
  it('builds an index-friendly access tenant predicate', () => {
    const predicate = matchesAccessTenant(table, 'tenant_access');
    const query = new PgDialect().sqlToQuery(predicate);
    const normalizedSql = query.sql
      .replaceAll(/\s+/g, ' ')
      .replaceAll('( ', '(')
      .replaceAll(' )', ')')
      .trim();

    expect(normalizedSql).toBe(
      '("claims"."access_tenant_id" = $1 OR ("claims"."access_tenant_id" IS NULL AND "claims"."tenant_id" = $2))'
    );
    expect(query.params).toEqual(['tenant_access', 'tenant_access']);
  });
});
