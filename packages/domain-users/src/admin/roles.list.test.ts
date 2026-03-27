import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUserRoles: vi.fn(),
  findUser: vi.fn(),
  withTenant: vi.fn((tenantId: string, _tenantColumn: unknown, condition?: unknown) => ({
    tenantId,
    condition,
  })),
  eq: vi.fn((left: unknown, right: unknown) => ({ type: 'eq', left, right })),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      userRoles: {
        findMany: (...args: unknown[]) => mocks.findUserRoles(...args),
      },
      user: {
        findFirst: (...args: unknown[]) => mocks.findUser(...args),
      },
    },
  },
  user: {
    id: 'user.id',
    tenantId: 'user.tenantId',
    role: 'user.role',
    branchId: 'user.branchId',
  },
  userRoles: {
    tenantId: 'userRoles.tenantId',
    userId: 'userRoles.userId',
  },
  branches: {},
  eq: mocks.eq,
  and: vi.fn(),
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
  isNull: vi.fn(),
}));

import { listUserRolesCore } from './roles';

describe('listUserRolesCore', () => {
  const session = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_ks' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUserRoles.mockResolvedValue([]);
    mocks.findUser.mockResolvedValue(null);
  });

  it('falls back to the legacy primary role for elevated seeded users without user_roles rows', async () => {
    mocks.findUser.mockResolvedValueOnce({
      id: 'pack_ks_staff_extra',
      role: 'staff',
      branchId: null,
    });

    const result = await listUserRolesCore({
      session,
      tenantId: 'tenant_ks',
      userId: 'pack_ks_staff_extra',
    });

    expect(result).toEqual([
      {
        id: 'legacy-pack_ks_staff_extra-staff-tenant',
        tenantId: 'tenant_ks',
        userId: 'pack_ks_staff_extra',
        role: 'staff',
        branchId: null,
      },
    ]);
  });

  it('merges the legacy primary role when explicit RBAC rows exist but do not include it', async () => {
    mocks.findUserRoles.mockResolvedValueOnce([
      {
        id: 'role-promoter',
        tenantId: 'tenant_ks',
        userId: 'pilot-user',
        role: 'promoter',
        branchId: null,
      },
    ]);
    mocks.findUser.mockResolvedValueOnce({
      id: 'pilot-user',
      role: 'agent',
      branchId: 'ks_pej_001',
    });

    const result = await listUserRolesCore({
      session,
      tenantId: 'tenant_ks',
      userId: 'pilot-user',
    });

    expect(result).toEqual([
      {
        id: 'legacy-pilot-user-agent-ks_pej_001',
        tenantId: 'tenant_ks',
        userId: 'pilot-user',
        role: 'agent',
        branchId: 'ks_pej_001',
      },
      {
        id: 'role-promoter',
        tenantId: 'tenant_ks',
        userId: 'pilot-user',
        role: 'promoter',
        branchId: null,
      },
    ]);
  });

  it('does not synthesize a legacy member row when explicit RBAC rows are absent', async () => {
    mocks.findUser.mockResolvedValueOnce({
      id: 'member-1',
      role: 'member',
      branchId: null,
    });

    const result = await listUserRolesCore({
      session,
      tenantId: 'tenant_ks',
      userId: 'member-1',
    });

    expect(result).toEqual([]);
  });
});
