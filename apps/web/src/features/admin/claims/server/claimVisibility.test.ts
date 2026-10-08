import { MissingTenantError } from '@interdomestik/shared-auth';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  adminClaimsBranchCondition,
  canViewAdminClaims,
  resolveClaimsVisibility,
  type ClaimsVisibilityContext,
} from './claimVisibility';

const dialect = new PgDialect();

function createContext(overrides: Partial<ClaimsVisibilityContext> = {}): ClaimsVisibilityContext {
  return {
    tenantId: 'tenant-A',
    userId: 'user-1',
    role: 'admin',
    branchId: null,
    ...overrides,
  };
}

// Real sessions carry more tenant fields than SessionWithUser declares.
function createSession(
  user: Record<string, unknown>
): Parameters<typeof resolveClaimsVisibility>[0] {
  return { session: { id: 'session-1' }, user: { id: 'user-1', ...user } } as never;
}

describe('resolveClaimsVisibility', () => {
  it('returns null without a session or user', async () => {
    await expect(resolveClaimsVisibility(null)).resolves.toBeNull();
    await expect(
      resolveClaimsVisibility({ session: { id: 'session-1' }, user: undefined } as never)
    ).resolves.toBeNull();
  });

  it('prefers the access tenant over the home tenant', async () => {
    await expect(
      resolveClaimsVisibility(
        createSession({ accessTenantId: 'tenant-access', tenantId: 'tenant-home', role: 'admin' })
      )
    ).resolves.toStrictEqual({
      tenantId: 'tenant-access',
      userId: 'user-1',
      role: 'admin',
      branchId: null,
    });
  });

  it.each([undefined, null, '', '   '])(
    'falls back to the home tenant when accessTenantId is %j',
    async accessTenantId => {
      const context = await resolveClaimsVisibility(
        createSession({ accessTenantId, tenantId: 'tenant-home' })
      );

      expect(context?.tenantId).toBe('tenant-home');
    }
  );

  it('fails closed instead of producing a context when no tenant is present', async () => {
    await expect(resolveClaimsVisibility(createSession({ role: 'admin' }))).rejects.toBeInstanceOf(
      MissingTenantError
    );
    await expect(
      resolveClaimsVisibility(createSession({ accessTenantId: ' ', tenantId: ' ' }))
    ).rejects.toBeInstanceOf(MissingTenantError);
  });

  it('carries user id, role and branch and defaults absent role and branch to null', async () => {
    await expect(
      resolveClaimsVisibility(
        createSession({ tenantId: 'tenant-A', role: 'branch_manager', branchId: 'branch-1' })
      )
    ).resolves.toStrictEqual({
      tenantId: 'tenant-A',
      userId: 'user-1',
      role: 'branch_manager',
      branchId: 'branch-1',
    });

    await expect(
      resolveClaimsVisibility(createSession({ tenantId: 'tenant-A' }))
    ).resolves.toStrictEqual({
      tenantId: 'tenant-A',
      userId: 'user-1',
      role: null,
      branchId: null,
    });
  });
});

describe('canViewAdminClaims', () => {
  it.each(['admin', 'tenant_admin', 'super_admin'])('allows %s with or without a branch', role => {
    expect(canViewAdminClaims(createContext({ role, branchId: null }))).toBe(true);
    expect(canViewAdminClaims(createContext({ role, branchId: 'branch-1' }))).toBe(true);
  });

  it('allows a branch manager only with a branch', () => {
    expect(
      canViewAdminClaims(createContext({ role: 'branch_manager', branchId: 'branch-1' }))
    ).toBe(true);
  });

  it.each([null, ''])('denies a branch manager with branchId %j', branchId => {
    expect(canViewAdminClaims(createContext({ role: 'branch_manager', branchId }))).toBe(false);
  });

  it.each(['member', 'agent', 'staff', null])('denies role %j even when a branch is set', role => {
    expect(canViewAdminClaims(createContext({ role, branchId: 'branch-1' }))).toBe(false);
    expect(canViewAdminClaims(createContext({ role, branchId: null }))).toBe(false);
  });
});

describe('adminClaimsBranchCondition', () => {
  it.each(['admin', 'tenant_admin', 'super_admin', 'staff', 'agent', 'member', null])(
    'adds no branch condition for role %j',
    role => {
      expect(
        adminClaimsBranchCondition(createContext({ role, branchId: 'branch-1' }))
      ).toBeUndefined();
      expect(adminClaimsBranchCondition(createContext({ role, branchId: null }))).toBeUndefined();
    }
  );

  it('limits a branch manager to the own branch', () => {
    const condition = adminClaimsBranchCondition(
      createContext({ role: 'branch_manager', branchId: 'branch-1' })
    );

    expect(condition).toBeDefined();
    const compiled = dialect.sqlToQuery(condition!);
    expect(compiled.sql).toBe('"claim"."branch_id" = $1');
    expect(compiled.params).toEqual(['branch-1']);
  });

  it.each([null, ''])('denies everything for a branch manager with branchId %j', branchId => {
    const condition = adminClaimsBranchCondition(
      createContext({ role: 'branch_manager', branchId })
    );

    expect(condition).toBeDefined();
    const compiled = dialect.sqlToQuery(condition!);
    expect(compiled.sql).toBe('false');
    expect(compiled.params).toEqual([]);
  });
});
