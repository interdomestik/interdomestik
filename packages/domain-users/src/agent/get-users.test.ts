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
    db: {
      select: vi.fn(),
      query: {
        user: {
          findMany,
        },
      },
    },
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

describe('getAgentUsersCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockResolvedValue([]);
    mocks.db.select.mockReturnValue(mocks.selectChain);
    mocks.db.query.user.findMany.mockResolvedValue([]);
  });

  it('throws when session is missing', async () => {
    await expect(getAgentUsersCore({ session: null })).rejects.toThrow('Unauthorized');
  });

  it('queries members for agent from both legacy and canonical member roles', async () => {
    await getAgentUsersCore({
      session: {
        user: {
          id: 'agent-1',
          role: 'agent',
          tenantId: 'tenant_ks',
        },
      } as any,
    });

    expect(mocks.inArray).toHaveBeenCalledWith(mocks.user.role, ['user', 'member']);
  });
});
