import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  const orderBy = vi.fn();
  const where = vi.fn(() => ({ orderBy }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin }));
  const select = vi.fn(() => ({ from }));
  const withTenantContext = vi.fn();
  return { findMany, from, innerJoin, orderBy, select, where, withTenantContext };
});

vi.mock('@interdomestik/database', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  claimMessages: {
    claimId: 'claimMessages.claimId',
    readAt: 'claimMessages.readAt',
    senderId: 'claimMessages.senderId',
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenantId', userId: 'claims.userId' },
  desc: vi.fn((column: unknown) => ({ desc: column })),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  ilike: vi.fn(),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
  or: vi.fn(),
  user: {
    agentId: 'user.agentId',
    branchId: 'user.branchId',
    email: 'user.email',
    name: 'user.name',
    role: 'user.role',
  },
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: vi.fn((tenantId: string, _column: unknown, condition?: unknown) => ({
    tenantId,
    condition,
  })),
}));
vi.mock('@interdomestik/shared-auth', () => ({
  scopeFilter: vi.fn(() => ({
    tenantId: 'tenant_ks',
    accessTenantId: 'tenant_ks',
    isFullTenantScope: true,
    isCrossTenantScope: false,
  })),
}));
vi.mock('drizzle-orm', () => ({ isNull: vi.fn((column: unknown) => ({ isNull: column })) }));
vi.mock('./access', () => ({ requireTenantAdminSession: vi.fn(async session => session) }));

import { getUsersCore } from './get-users';

describe('admin user list RLS context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: 'staff-1', role: 'staff' }]);
    mocks.orderBy.mockResolvedValue([{ userId: 'staff-1', claimId: 'claim-1' }]);
    mocks.withTenantContext.mockImplementation(async (_context, action) =>
      action({ query: { user: { findMany: mocks.findMany } }, select: mocks.select })
    );
  });

  it('reads users and message counts in the same tenant-scoped transaction', async () => {
    const users = await getUsersCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
      filters: { role: 'admin,staff' },
    });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks', accessTenantId: 'tenant_ks', role: 'tenant_admin' },
      expect.any(Function)
    );
    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(users).toEqual([
      {
        id: 'staff-1',
        role: 'staff',
        unreadCount: 1,
        unreadClaimId: 'claim-1',
        alertLink: '/admin/claims/claim-1',
      },
    ]);
  });
});
