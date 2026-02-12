import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  withTenant: vi.fn((tenantId: string, _tenantCol: unknown, condition?: unknown) => ({
    tenantId,
    condition,
  })),
  eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  isNull: vi.fn((value: unknown) => ({ type: 'isNull', value })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    transaction: mocks.transaction,
  },
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

describe('revokeUserRoleCore', () => {
  const session = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_ks' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses exact tenant-wide scope when branchId is undefined and falls back user role to member', async () => {
    const deleteWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]),
    });
    const updateWhere = vi.fn().mockResolvedValue([{ id: 'user-1' }]);

    mocks.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        delete: vi.fn(() => ({ where: deleteWhere })),
        query: {
          user: {
            findFirst: vi.fn().mockResolvedValue({ role: 'agent' }),
          },
          userRoles: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: updateWhere,
          })),
        })),
      };
      return fn(tx);
    });

    const result = await revokeUserRoleCore({
      session,
      userId: 'user-1',
      role: 'agent',
      tenantId: 'tenant_ks',
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

    mocks.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        delete: vi.fn(() => ({ where: deleteWhere })),
        query: {
          user: {
            findFirst: vi.fn().mockResolvedValue({ role: 'member' }),
          },
          userRoles: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
          })),
        })),
      };
      return fn(tx);
    });

    const result = await revokeUserRoleCore({
      session,
      userId: 'user-1',
      role: 'agent',
      tenantId: 'tenant_ks',
      branchId: 'ks_branch_a',
    });

    expect(result).toEqual({ success: true });
    expect(mocks.eq).toHaveBeenCalledWith('userRoles.branchId', 'ks_branch_a');
    expect(mocks.isNull).not.toHaveBeenCalledWith('userRoles.branchId');
  });
});
