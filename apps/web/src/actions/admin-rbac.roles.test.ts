import { beforeEach, describe, expect, it, vi } from 'vitest';

import { grantUserRoleCore } from '@interdomestik/domain-users/admin/rbac';

const hoisted = vi.hoisted(() => ({
  branchesFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      branches: {
        findFirst: hoisted.branchesFindFirst,
      },
    },
    transaction: hoisted.transaction,
  },
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  branches: {
    id: 'branches.id',
    tenantId: 'branches.tenantId',
  },
  user: {
    id: 'user.id',
  },
  userRoles: {
    tenantId: 'userRoles.tenantId',
    userId: 'userRoles.userId',
    role: 'userRoles.role',
    branchId: 'userRoles.branchId',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('@interdomestik/shared-auth', () => ({
  hasPermission: vi.fn(() => true),
  PERMISSIONS: {
    'roles.manage': 'roles.manage',
  },
  requirePermission: vi.fn(),
}));

describe('domain-users rbac: branch required roles', () => {
  const session = {
    user: { id: 'admin-1', role: 'super_admin', tenantId: 'tenant_mk' },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.transaction.mockImplementation(async fn => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: 'user-1' }]),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]),
          })),
        })),
      };

      return fn(tx);
    });
  });

  it('rejects assigning agent role without branchId', async () => {
    const result = await grantUserRoleCore({
      session,
      tenantId: 'tenant_mk',
      userId: 'user-1',
      role: 'agent',
      branchId: null,
    });

    expect(result).toEqual({ error: 'Branch is required for role: agent' });
    expect(hoisted.branchesFindFirst).not.toHaveBeenCalled();
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('rejects assigning branch_manager role without branchId', async () => {
    const result = await grantUserRoleCore({
      session,
      tenantId: 'tenant_mk',
      userId: 'user-1',
      role: 'branch_manager',
      branchId: null,
    });

    expect(result).toEqual({ error: 'Branch is required for role: branch_manager' });
    expect(hoisted.branchesFindFirst).not.toHaveBeenCalled();
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('rejects assigning branch-scoped role to inactive branch', async () => {
    hoisted.branchesFindFirst.mockResolvedValue({ id: 'b-1', isActive: false });

    const result = await grantUserRoleCore({
      session,
      tenantId: 'tenant_mk',
      userId: 'user-1',
      role: 'agent',
      branchId: 'b-1',
    });

    expect(result).toEqual({ error: 'Cannot assign role to inactive branch' });
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('rejects assigning branch-scoped role to branch outside tenant', async () => {
    hoisted.branchesFindFirst.mockResolvedValue(null);

    const result = await grantUserRoleCore({
      session,
      tenantId: 'tenant_mk',
      userId: 'user-1',
      role: 'agent',
      branchId: 'b-404',
    });

    expect(result).toEqual({ error: 'Invalid branch' });
    expect(hoisted.transaction).not.toHaveBeenCalled();
  });

  it('returns error when grant target user does not exist', async () => {
    hoisted.branchesFindFirst.mockResolvedValue({ id: 'b-1', isActive: true });
    hoisted.transaction.mockImplementationOnce(async fn => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'role-1' }]),
          })),
        })),
      };

      return fn(tx);
    });

    await expect(
      grantUserRoleCore({
        session,
        tenantId: 'tenant_mk',
        userId: 'user-1',
        role: 'agent',
        branchId: 'b-1',
      })
    ).rejects.toThrow('Role grant target user not found');
  });
});
