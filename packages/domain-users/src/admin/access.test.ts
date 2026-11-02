import { beforeEach, describe, expect, it, vi } from 'vitest';

import { eq } from '@interdomestik/database';

import {
  requireTenantAdminOrBranchManagerSession,
  requireTenantAdminSession,
  userHasRole,
} from './access';
import type { UserSession } from '../types';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';

const dbMock = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return { from, limit, select, where };
});

vi.mock('@interdomestik/database', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  db: { select: dbMock.select },
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) =>
    cb({ select: dbMock.select })
  ),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  userRoles: {
    id: 'id',
    userId: 'userId',
    tenantId: 'tenantId',
    role: 'role',
    branchId: 'branchId',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((_tenantId: string, _column: unknown, condition: unknown) => condition),
}));

vi.mock('drizzle-orm', () => ({
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
}));

function ownAuthority(role: string, tenantId = 'tenant-1', userId = 'user-1') {
  return mintTestTenantAuthority(tenantId, { userId, role });
}

function session(role: string, tenantId: string | null = 'tenant-1'): UserSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role,
      ...(tenantId === null ? {} : { tenantId }),
    },
  };
}

describe('admin access role boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.limit.mockResolvedValue([]);
  });

  it('preserves primary super_admin admin operations without tenant role lookup', async () => {
    await expect(requireTenantAdminSession(session('super_admin'))).resolves.toEqual(
      session('super_admin')
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('preserves primary super_admin admin-or-branch operations without tenant role lookup', async () => {
    await expect(requireTenantAdminOrBranchManagerSession(session('super_admin'))).resolves.toEqual(
      session('super_admin')
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('keeps primary tenant admin roles authorized', async () => {
    await expect(requireTenantAdminSession(session('tenant_admin'))).resolves.toEqual(
      session('tenant_admin')
    );
    await expect(requireTenantAdminSession(session('admin'))).resolves.toEqual(session('admin'));
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('requires tenant context for primary tenant admin roles', async () => {
    await expect(requireTenantAdminSession(session('tenant_admin', null))).rejects.toThrow(
      'Session missing tenantId'
    );
    await expect(requireTenantAdminSession(session('admin', null))).rejects.toThrow(
      'Session missing tenantId'
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('accepts explicit tenant super admin grants', async () => {
    dbMock.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'role-1' }]);
    await expect(
      requireTenantAdminSession(session('staff'), ownAuthority('staff'))
    ).resolves.toEqual(session('staff'));
    expect(eq).toHaveBeenCalledWith('role', 'super_admin');
  });

  it('allows primary branch managers only when tenant and branch scoped', async () => {
    const scopedSession = {
      ...session('branch_manager'),
      user: { ...session('branch_manager').user, branchId: 'branch-1' },
    } as UserSession;

    await expect(requireTenantAdminOrBranchManagerSession(scopedSession)).resolves.toEqual(
      scopedSession
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('rejects primary branch managers missing tenant context', async () => {
    const scopedSession = {
      ...session('branch_manager', null),
      user: { ...session('branch_manager', null).user, branchId: 'branch-1' },
    } as UserSession;

    await expect(requireTenantAdminOrBranchManagerSession(scopedSession)).rejects.toThrow(
      'Session missing tenantId'
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('rejects primary branch managers missing branch context', async () => {
    await expect(
      requireTenantAdminOrBranchManagerSession(session('branch_manager'))
    ).rejects.toThrow('Unauthorized');
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('does not query tenant-wide branch manager RBAC grants without branch context', async () => {
    await expect(requireTenantAdminOrBranchManagerSession(session('staff'))).rejects.toThrow(
      'Unauthorized'
    );
    expect(eq).not.toHaveBeenCalledWith('role', 'branch_manager');
  });

  it('does not let super_admin implicitly satisfy every tenant role', async () => {
    await expect(
      userHasRole({
        session: session('super_admin'),
        authority: ownAuthority('super_admin'),
        role: 'branch_manager',
        branchId: null,
      })
    ).resolves.toBe(false);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it('denies the RBAC grant fallback without the session user authority and reads nothing', async () => {
    dbMock.limit.mockResolvedValue([{ id: 'role-1' }]);
    await expect(requireTenantAdminSession(session('staff'))).rejects.toThrow('Unauthorized');
    await expect(
      requireTenantAdminSession(session('staff'), ownAuthority('staff', 'tenant-2'))
    ).rejects.toThrow('Unauthorized');
    await expect(
      requireTenantAdminSession(session('staff'), ownAuthority('staff', 'tenant-1', 'user-2'))
    ).rejects.toThrow('Unauthorized');
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('reads RBAC grants under the session user authority', async () => {
    const { withTenantContext } = await import('@interdomestik/database');
    const authority = ownAuthority('staff');
    dbMock.limit.mockResolvedValueOnce([{ id: 'role-1' }]);

    await expect(requireTenantAdminSession(session('staff'), authority)).resolves.toEqual(
      session('staff')
    );
    expect(vi.mocked(withTenantContext).mock.calls[0][0]).toBe(authority);
  });
});
