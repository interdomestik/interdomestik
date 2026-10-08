import { user } from '@interdomestik/database/schema';
import { scopeFilter } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  memberReadWhere,
  resolveMemberReadScope,
  type GrantedMemberReadScope,
} from './member-read-scope';

const dialect = new PgDialect();
const target = eq(user.id, 'u1');

function granted(role: string, branchId: string | null, tenantId = 't1'): GrantedMemberReadScope {
  const scope = resolveMemberReadScope({ tenantId, actor: { role, branchId } });
  if (!scope.ok) throw new Error(`expected ${role} to be granted`);
  return scope;
}

describe('resolveMemberReadScope', () => {
  it.each(['admin', 'tenant_admin', 'super_admin'])(
    'grants %s tenant-wide reads regardless of a session branch',
    role => {
      for (const branchId of ['b-A', null]) {
        expect(resolveMemberReadScope({ tenantId: 't1', actor: { role, branchId } })).toEqual({
          ok: true,
          role,
          tenantId: 't1',
          branchId: null,
        });
      }
    }
  );

  it('grants a branch manager only their own branch, matching the shared scopeFilter', () => {
    const shared = scopeFilter({
      user: { role: 'branch_manager', branchId: 'b-A', accessTenantId: 't1' },
    });
    expect(shared.isFullTenantScope).toBe(false);
    expect(granted('branch_manager', 'b-A')).toEqual({
      ok: true,
      role: 'branch_manager',
      tenantId: 't1',
      branchId: shared.branchId,
    });
  });

  it.each([null, ''])('denies a branch manager with missing branch %j', branchId => {
    expect(
      resolveMemberReadScope({ tenantId: 't1', actor: { role: 'branch_manager', branchId } })
    ).toEqual({ ok: false });
  });

  it.each(['staff', 'agent', 'member', 'global_support', 'auditor', 'user', '', null])(
    'denies role %j outside the admin member-read contract',
    role => {
      expect(resolveMemberReadScope({ tenantId: 't1', actor: { role, branchId: 'b-A' } })).toEqual({
        ok: false,
      });
    }
  );

  it.each(['', '   '])('denies every role when the tenant is blank (%j)', tenantId => {
    for (const role of ['super_admin', 'tenant_admin', 'branch_manager']) {
      expect(resolveMemberReadScope({ tenantId, actor: { role, branchId: 'b-A' } })).toEqual({
        ok: false,
      });
    }
  });

  it('normalizes the caller-owned tenant', () => {
    expect(granted('tenant_admin', null, '  t1  ').tenantId).toBe('t1');
  });
});

describe('memberReadWhere', () => {
  it('adds only the tenant predicate for tenant-wide scopes', () => {
    expect(dialect.sqlToQuery(memberReadWhere(granted('tenant_admin', 'b-A'), target))).toEqual(
      dialect.sqlToQuery(and(target, eq(user.tenantId, 't1'))!)
    );
  });

  it('adds the stored user.branchId predicate for branch scopes', () => {
    const query = dialect.sqlToQuery(memberReadWhere(granted('branch_manager', 'b-A'), target));
    expect(query).toEqual(
      dialect.sqlToQuery(and(target, eq(user.tenantId, 't1'), eq(user.branchId, 'b-A'))!)
    );
    expect(query.params).toEqual(['u1', 't1', 'b-A']);
  });
});
