import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  withTenant: vi.fn((tenantId: string, _tenantCol: unknown, condition?: unknown) => ({
    tenantId,
    condition,
  })),
  eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((value: unknown) => ({ type: 'isNull', value })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {},
  withTenantContext: (...args: unknown[]) => mocks.withTenantContext(...args),
  user: {
    id: 'user.id',
    tenantId: 'user.tenantId',
  },
  userRoles: {
    id: 'userRoles.id',
    tenantId: 'userRoles.tenantId',
    userId: 'userRoles.userId',
    role: 'userRoles.role',
    branchId: 'userRoles.branchId',
  },
  branches: {},
  eq: mocks.eq,
  and: mocks.and,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureAccessTenantId: vi.fn(
    session => session.user.accessTenantId?.trim() || session.user.tenantId?.trim()
  ),
  hasPermission: vi.fn(() => true),
  PERMISSIONS: {
    'roles.manage': 'roles.manage',
  },
  requirePermission: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  isNull: mocks.isNull,
}));

import { revokeUserRoleCore } from './roles';

function revokeTransaction(
  role: string,
  deleteWhere: ReturnType<typeof vi.fn>,
  updateWhere = vi.fn(),
  locked: { branchId?: string | null; grants?: { role: string; branchId: string | null }[] } = {}
) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          for: vi.fn().mockResolvedValue([{ role, branchId: locked.branchId ?? null }]),
        }),
      }),
    }),
    delete: () => ({ where: deleteWhere }),
    query: { userRoles: { findMany: vi.fn().mockResolvedValue(locked.grants ?? []) } },
    update: () => ({ set: () => ({ where: updateWhere }) }),
  };
}

describe('revokeUserRoleCore', () => {
  const session = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_ks' },
  };
  const authority = mintTestTenantAuthority('tenant_ks', { userId: 'admin-1', role: 'admin' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses exact tenant-wide scope when branchId is undefined and falls back user role to member', async () => {
    const deleteWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]),
    });
    const updateWhere = vi.fn().mockResolvedValue([{ id: 'user-1' }]);

    mocks.withTenantContext.mockImplementationOnce(async (_context, fn) =>
      fn(revokeTransaction('agent', deleteWhere, updateWhere))
    );

    const result = await revokeUserRoleCore({
      session,
      authority,
      userId: 'user-1',
      role: 'agent',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.isNull).toHaveBeenCalledWith('userRoles.branchId');
    expect(mocks.eq).toHaveBeenCalledWith('userRoles.role', 'agent');
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant_ks',
      'userRoles.tenantId',
      expect.any(Object)
    );
    expect(updateWhere).toHaveBeenCalled();
  });

  it('uses exact branch scope when branchId is provided', async () => {
    const deleteWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]),
    });

    mocks.withTenantContext.mockImplementationOnce(async (_context, fn) =>
      fn(revokeTransaction('member', deleteWhere))
    );

    const result = await revokeUserRoleCore({
      session,
      authority,
      userId: 'user-1',
      role: 'agent',
      branchId: 'ks_branch_a',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.eq).toHaveBeenCalledWith('userRoles.branchId', 'ks_branch_a');
    expect(mocks.isNull).not.toHaveBeenCalledWith('userRoles.branchId');
  });

  it('fails closed before deleting when the remaining roles keep a grant outside the branch', async () => {
    // agent@ks_branch_a then granted staff: membership is cleared but the agent grant remains.
    const deleteWhere = vi.fn();
    const updateWhere = vi.fn();
    mocks.withTenantContext.mockImplementationOnce(async (_context, fn) =>
      fn(
        revokeTransaction('staff', deleteWhere, updateWhere, {
          branchId: null,
          grants: [
            { role: 'agent', branchId: 'ks_branch_a' },
            { role: 'staff', branchId: null },
          ],
        })
      )
    );

    await expect(
      revokeUserRoleCore({ session, authority, userId: 'user-1', role: 'staff' })
    ).resolves.toEqual({
      error: 'Role grants must stay in the user branch',
      code: 'BRANCH_MEMBERSHIP_CONFLICT',
    });
    expect(deleteWhere).not.toHaveBeenCalled();
    expect(updateWhere).not.toHaveBeenCalled();
  });
});
