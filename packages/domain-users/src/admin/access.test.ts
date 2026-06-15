import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  requireTenantAdminOrBranchManagerSession,
  requireTenantAdminSession,
  userHasRole,
} from './access';
import type { UserSession } from '../types';

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

function session(role: string, tenantId: string | null = 'tenant-1'): UserSession {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role,
      ...(tenantId === null ? {} : { tenantId }),
    },
  } as UserSession;
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

  it('does not let super_admin implicitly satisfy every tenant role', async () => {
    await expect(
      userHasRole({
        session: session('super_admin'),
        role: 'branch_manager',
        branchId: null,
      })
    ).resolves.toBe(false);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });
});
