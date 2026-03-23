import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const userUpdateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const subscriptionsUpdateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const agentClientsUpdateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
    onConflictDoUpdate: vi.fn(),
  };
  const tx = {
    update: vi.fn(),
    insert: vi.fn(),
  };

  return {
    agentClients: {
      id: 'agentClients.id',
      tenantId: 'agentClients.tenantId',
      agentId: 'agentClients.agentId',
      memberId: 'agentClients.memberId',
      status: 'agentClients.status',
      joinedAt: 'agentClients.joinedAt',
    },
    subscriptions: {
      id: 'subscriptions.id',
      tenantId: 'subscriptions.tenantId',
      userId: 'subscriptions.userId',
      status: 'subscriptions.status',
      agentId: 'subscriptions.agentId',
    },
    user: {
      id: 'user.id',
      tenantId: 'user.tenantId',
      agentId: 'user.agentId',
    },
    db: {
      transaction: vi.fn(),
    },
    tx,
    userUpdateChain,
    subscriptionsUpdateChain,
    agentClientsUpdateChain,
    insertChain,
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    and: vi.fn((...parts) => ({ op: 'and', parts })),
    withTenant: vi.fn((tenantId, tenantColumn, filter) => ({
      op: 'withTenant',
      tenantId,
      tenantColumn,
      filter,
    })),
    requireTenantAdminSession: vi.fn(async session => session),
    ensureTenantId: vi.fn(() => 'tenant_ks'),
    randomUUID: vi.fn(() => 'uuid-1'),
  };
});

vi.mock('@interdomestik/database', () => ({
  agentClients: mocks.agentClients,
  db: mocks.db,
  eq: mocks.eq,
  subscriptions: mocks.subscriptions,
  user: mocks.user,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('./access', () => ({
  requireTenantAdminSession: mocks.requireTenantAdminSession,
}));

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID,
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
}));

import { updateUserAgentCore } from './update-user-agent';

describe('updateUserAgentCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.userUpdateChain.set.mockReturnValue(mocks.userUpdateChain);
    mocks.userUpdateChain.where.mockResolvedValue(undefined);
    mocks.subscriptionsUpdateChain.set.mockReturnValue(mocks.subscriptionsUpdateChain);
    mocks.subscriptionsUpdateChain.where.mockResolvedValue(undefined);
    mocks.agentClientsUpdateChain.set.mockReturnValue(mocks.agentClientsUpdateChain);
    mocks.agentClientsUpdateChain.where.mockResolvedValue(undefined);
    mocks.insertChain.values.mockReturnValue(mocks.insertChain);
    mocks.insertChain.onConflictDoUpdate.mockResolvedValue(undefined);
    mocks.tx.update.mockImplementation(table => {
      if (table === mocks.user) return mocks.userUpdateChain;
      if (table === mocks.subscriptions) return mocks.subscriptionsUpdateChain;
      if (table === mocks.agentClients) return mocks.agentClientsUpdateChain;
      throw new Error(`Unexpected update table: ${String(table)}`);
    });
    mocks.tx.insert.mockReturnValue(mocks.insertChain);
    mocks.db.transaction.mockImplementation(async callback => callback(mocks.tx as never));
  });

  it('updates user, subscription, and ownership rows when assigning an agent', async () => {
    const result = await updateUserAgentCore({
      session: {
        user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' },
      } as never,
      userId: 'member-1',
      agentId: 'agent-2',
    });

    expect('success' in result).toBe(true);
    if (!('success' in result)) {
      throw new Error(`Expected success result, received error: ${result.error}`);
    }
    expect(result.success).toBe(true);
    expect(mocks.tx.update).toHaveBeenCalledTimes(3);
    expect(mocks.tx.insert).toHaveBeenCalledTimes(1);

    expect(mocks.tx.update).toHaveBeenNthCalledWith(1, mocks.user);
    expect(mocks.tx.update).toHaveBeenNthCalledWith(2, mocks.subscriptions);
    expect(mocks.tx.update).toHaveBeenNthCalledWith(3, mocks.agentClients);

    expect(mocks.userUpdateChain.set).toHaveBeenCalledWith({ agentId: 'agent-2' });
    expect(mocks.subscriptionsUpdateChain.set).toHaveBeenCalledWith({ agentId: 'agent-2' });
    expect(mocks.agentClientsUpdateChain.set).toHaveBeenCalledWith({ status: 'inactive' });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant_ks',
      mocks.subscriptions.tenantId,
      expect.objectContaining({
        op: 'and',
        parts: [
          {
            op: 'eq',
            left: mocks.subscriptions.userId,
            right: 'member-1',
          },
          {
            op: 'eq',
            left: mocks.subscriptions.status,
            right: 'active',
          },
        ],
      })
    );

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant_ks',
      mocks.user.tenantId,
      expect.objectContaining({
        op: 'eq',
        left: mocks.user.id,
        right: 'member-1',
      })
    );

    expect(mocks.insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_ks',
        agentId: 'agent-2',
        memberId: 'member-1',
        status: 'active',
      })
    );
  });

  it('moves the member to company-owned when clearing the agent', async () => {
    const result = await updateUserAgentCore({
      session: {
        user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_ks' },
      } as never,
      userId: 'member-1',
      agentId: null,
    });

    expect('success' in result).toBe(true);
    if (!('success' in result)) {
      throw new Error(`Expected success result, received error: ${result.error}`);
    }
    expect(result.success).toBe(true);
    expect(mocks.tx.insert).not.toHaveBeenCalled();
    expect(mocks.tx.update).toHaveBeenCalledTimes(3);
    expect(mocks.subscriptionsUpdateChain.set).toHaveBeenCalledWith({ agentId: null });
    expect(mocks.subscriptionsUpdateChain.where).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'withTenant',
        tenantId: 'tenant_ks',
        tenantColumn: mocks.subscriptions.tenantId,
        filter: expect.objectContaining({
          op: 'and',
          parts: [
            {
              op: 'eq',
              left: mocks.subscriptions.userId,
              right: 'member-1',
            },
            {
              op: 'eq',
              left: mocks.subscriptions.status,
              right: 'active',
            },
          ],
        }),
      })
    );
  });
});
