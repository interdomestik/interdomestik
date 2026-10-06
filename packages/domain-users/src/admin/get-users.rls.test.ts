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
    createdAt: 'claimMessages.createdAt',
    id: 'claimMessages.id',
  },
  claims: { id: 'claims.id', tenantId: 'claims.tenantId', userId: 'claims.userId' },
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
      mapWith: () => ({ strings, values }),
    }),
    {}
  ),
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
  withTenant: vi.fn((tenantId: string, column: unknown, condition?: unknown) => ({
    tenantId,
    column,
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

import { inArray } from '@interdomestik/database';
import { getUsersCore } from './get-users';

describe('admin user list RLS context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: 'staff-1', role: 'staff' }]);
    mocks.orderBy.mockResolvedValue([{ userId: 'staff-1', claimId: 'claim-1', count: 3 }]);
    mocks.withTenantContext.mockImplementation(async (_context, action) =>
      action({ query: { user: { findMany: mocks.findMany } }, selectDistinctOn: mocks.select })
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
        unreadCount: 3,
        unreadClaimId: 'claim-1',
        alertLink: '/admin/claims/claim-1',
      },
    ]);
  });
  it('does not query unread messages for an empty result', async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(
      await getUsersCore({
        session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
      })
    ).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('keeps lookup row shape without querying unread messages', async () => {
    const users = await getUsersCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
      includeUnreadCounts: false,
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(users[0]).toMatchObject({
      id: 'staff-1',
      unreadCount: 0,
      unreadClaimId: null,
      alertLink: null,
    });
  });
  it('bounds unread aggregation to listed IDs and returns one count/latest claim per user', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'member-1' }, { id: 'member-2' }]);
    mocks.orderBy.mockResolvedValue([{ userId: 'member-1', claimId: 'latest-claim', count: 5 }]);
    const users = await getUsersCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
    });
    expect(inArray).toHaveBeenCalledWith('claims.userId', ['member-1', 'member-2']);
    expect(mocks.select).toHaveBeenCalledWith(
      ['claims.userId'],
      expect.objectContaining({ userId: 'claims.userId', claimId: 'claims.id' })
    );
    expect(mocks.orderBy).toHaveBeenCalledWith(
      'claims.userId',
      expect.objectContaining({ values: ['claimMessages.createdAt'] }),
      expect.objectContaining({ values: ['claimMessages.id'] })
    );
    expect(users).toEqual([
      {
        id: 'member-1',
        unreadCount: 5,
        unreadClaimId: 'latest-claim',
        alertLink: '/admin/claims/latest-claim',
      },
      { id: 'member-2', unreadCount: 0, unreadClaimId: null, alertLink: null },
    ]);
  });
  function listQueryArgs() {
    return mocks.findMany.mock.calls[0][0] as {
      with?: Record<string, unknown>;
      where: (table: { tenantId: string }, operators: Record<string, unknown>) => unknown;
      orderBy: (
        table: { createdAt: string },
        operators: { desc: (column: unknown) => unknown }
      ) => unknown[];
    };
  }
  it('projects scalar user columns without eagerly loading the agent relation', async () => {
    mocks.findMany.mockImplementation(async (args: { with?: Record<string, unknown> }) => [
      {
        id: 'member-1',
        role: 'member',
        agentId: 'agent-1',
        branchId: 'branch-1',
        // The relational query returns a nested agent only when the caller opts in.
        ...(args.with?.agent ? { agent: { id: 'agent-1', name: 'Agent One' } } : {}),
      },
    ]);
    mocks.orderBy.mockResolvedValue([]);
    const users = await getUsersCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
    });
    expect(listQueryArgs()).not.toHaveProperty('with');
    expect(users).toEqual([
      {
        id: 'member-1',
        role: 'member',
        agentId: 'agent-1',
        branchId: 'branch-1',
        unreadCount: 0,
        unreadClaimId: null,
        alertLink: null,
      },
    ]);
  });
  it('keeps the list query tenant-scoped and ordered by newest first', async () => {
    await getUsersCore({
      session: { user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' } },
      filters: { role: 'admin,staff' },
    });
    const args = listQueryArgs();
    const whereClause = args.where({ tenantId: 'user.tenantId' }, { eq: vi.fn(), and: vi.fn() });
    expect(whereClause).toMatchObject({ tenantId: 'tenant_ks', column: 'user.tenantId' });
    const order = args.orderBy(
      { createdAt: 'user.createdAt' },
      { desc: column => ({ desc: column }) }
    );
    expect(order).toEqual([{ desc: 'user.createdAt' }]);
  });
});
