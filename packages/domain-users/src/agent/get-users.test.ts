import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const findMany = vi.fn();
  return {
    user: {
      role: 'user.role',
      id: 'user.id',
      name: 'user.name',
      email: 'user.email',
      tenantId: 'user.tenantId',
      createdAt: 'user.createdAt',
    },
    agentClients: {
      memberId: 'agent_clients.memberId',
      tenantId: 'agent_clients.tenantId',
      agentId: 'agent_clients.agentId',
      status: 'agent_clients.status',
    },
    // Global handle: must stay untouched.
    db: {
      select: vi.fn(),
      query: { user: { findMany: vi.fn() } },
    },
    tx: {
      select: vi.fn(),
      query: { user: { findMany } },
    },
    withTenantContext: vi.fn(),
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...parts) => ({ op: 'and', parts })),
    inArray: vi.fn((left, right) => ({ op: 'inArray', left, right })),
    ilike: vi.fn((left, right) => ({ op: 'ilike', left, right })),
    or: vi.fn((...parts) => ({ op: 'or', parts })),
    withTenant: vi.fn((tenantId, tenantColumn, filter) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    ensureTenantId: vi.fn(() => 'tenant_ks'),
    selectChain: {
      from: vi.fn(),
      where: vi.fn(),
    },
  };
});

vi.mock('@interdomestik/database', () => ({
  agentClients: mocks.agentClients,
  db: mocks.db,
  eq: mocks.eq,
  ilike: mocks.ilike,
  inArray: mocks.inArray,
  or: mocks.or,
  user: mocks.user,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

import { getAgentUsersCore } from './get-users';

function sessionFor(role: string | undefined, id = 'agent-1') {
  return { user: { id, role, tenantId: 'tenant_ks' } } as never;
}

function expectNoGlobalDb() {
  expect(mocks.db.select).not.toHaveBeenCalled();
  expect(mocks.db.query.user.findMany).not.toHaveBeenCalled();
}

describe('getAgentUsersCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => callback(mocks.tx)
    );
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockResolvedValue([]);
    mocks.tx.select.mockReturnValue(mocks.selectChain);
    mocks.tx.query.user.findMany.mockResolvedValue([]);
  });

  it('throws when session is missing', async () => {
    await expect(getAgentUsersCore({ session: null })).rejects.toThrow('Unauthorized');
    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it.each(['staff', 'tenant_admin', 'super_admin', 'branch_manager', 'member', undefined])(
    'denies role %j before any transaction or query',
    async role => {
      await expect(getAgentUsersCore({ session: sessionFor(role) })).rejects.toThrow(
        'Unauthorized'
      );
      expect(mocks.withTenantContext).not.toHaveBeenCalled();
      expect(mocks.tx.select).not.toHaveBeenCalled();
      expectNoGlobalDb();
    }
  );

  it('queries members for agent from both legacy and canonical member roles', async () => {
    mocks.selectChain.where.mockResolvedValue([{ memberId: 'member-1' }]);

    await getAgentUsersCore({ session: sessionFor('agent') });

    expect(mocks.inArray).toHaveBeenCalledWith(mocks.user.role, ['user', 'member']);
  });

  it('reads agent links and users in one tenant transaction as the actual agent', async () => {
    mocks.selectChain.where.mockResolvedValue([{ memberId: 'member-1' }, { memberId: 'member-2' }]);

    await getAgentUsersCore({
      session: sessionFor('agent'),
      filters: { search: 'ar', limit: 10, offset: 20 },
    });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant_ks',
      role: 'agent',
    });
    expect(mocks.tx.select).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.agentId, 'agent-1');
    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.status, 'active');
    expect(mocks.inArray).toHaveBeenCalledWith(mocks.user.id, ['member-1', 'member-2']);
    expect(mocks.ilike).toHaveBeenCalledWith(mocks.user.email, '%ar%');
    expect(mocks.tx.query.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 10,
        offset: 20,
        where: expect.objectContaining({ op: 'withTenant', tenantId: 'tenant_ks' }),
        with: expect.objectContaining({ agent: true }),
      })
    );
    expectNoGlobalDb();
  });

  it('returns empty without reading users when the agent has no active links', async () => {
    await expect(getAgentUsersCore({ session: sessionFor('agent') })).resolves.toEqual([]);

    expect(mocks.tx.query.user.findMany).not.toHaveBeenCalled();
    expectNoGlobalDb();
  });

  it('reads tenant users for admin without the agent link query', async () => {
    mocks.tx.query.user.findMany.mockResolvedValue([
      { id: 'member-1', subscriptions: [{ id: 'sub-1' }] },
      { id: 'member-2', subscriptions: [] },
    ]);

    const result = await getAgentUsersCore({ session: sessionFor('admin', 'admin-1') });

    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant_ks',
      role: 'admin',
    });
    expect(mocks.tx.select).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'member-1',
        subscriptions: [{ id: 'sub-1' }],
        unreadCount: 0,
        alertLink: null,
        subscription: { id: 'sub-1' },
      },
      { id: 'member-2', subscriptions: [], unreadCount: 0, alertLink: null, subscription: null },
    ]);
    expectNoGlobalDb();
  });

  it('propagates read failures from inside the transaction', async () => {
    const failure = new Error('permission denied for table user');
    mocks.tx.query.user.findMany.mockRejectedValue(failure);

    await expect(getAgentUsersCore({ session: sessionFor('admin', 'admin-1') })).rejects.toBe(
      failure
    );
  });
});
