import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: vi.fn(),
}));
import { buildClaimsQuery } from './queries';

const dialect = new PgDialect();
const ROLES = [
  ['member', null],
  ['agent', 'ks_branch_a'],
  ['staff', 'ks_branch_a'],
  ['staff', null],
  ['branch_manager', 'ks_branch_a'],
  ['admin', null],
  ['tenant_admin', null],
  ['super_admin', null],
  ['global_support', null],
  ['auditor', null],
] as const;

function render(role: string, branchId: string | null, extra: object = {}) {
  const { where } = buildClaimsQuery({
    tenantId: 'tenant_ks',
    userId: 'actor-1',
    role,
    branchId,
    ...extra,
  });
  return dialect.sqlToQuery(where!);
}

describe('claims list scope', () => {
  it.each(ROLES)('limits %s (branch %s) to claims it owns in its tenant', (role, branchId) => {
    const { sql, params } = render(role, branchId);
    expect(sql).toBe('("claim"."tenant_id" = $1 and "claim"."userId" = $2)');
    expect(params).toEqual(['tenant_ks', 'actor-1']);
  });

  it('keeps the ownership predicate ahead of search and assignment filters', () => {
    const { sql, params } = render('admin', null, { search: 'KS-B', assignment: 'unassigned' });
    expect(sql.startsWith('("claim"."tenant_id" = $1 and "claim"."userId" = $2 and (')).toBe(true);
    expect(params.slice(0, 2)).toEqual(['tenant_ks', 'actor-1']);
    expect(sql).not.toMatch(/branch_id" = /);
  });
});
