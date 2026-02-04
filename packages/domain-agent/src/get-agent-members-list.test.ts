import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };

  const sql = Object.assign(vi.fn(), {
    join: vi.fn((items: unknown[], separator: unknown) => ({ items, separator })),
  });

  return {
    chain,
    sql,
    select: vi.fn(),
    ilike: vi.fn((column, value) => ({ column, value, op: 'ilike' })),
    or: vi.fn((...conditions) => ({ conditions, op: 'or' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    desc: vi.fn(value => ({ value, op: 'desc' })),
    agentClients: {
      memberId: 'agent_clients.member_id',
      agentId: 'agent_clients.agent_id',
      tenantId: 'agent_clients.tenant_id',
      joinedAt: 'agent_clients.joined_at',
    },
    claims: {
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
      tenantId: 'claims.tenant_id',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      memberNumber: 'user.member_number',
      updatedAt: 'user.updated_at',
      role: 'user.role',
    },
    db: {
      select: vi.fn(),
    },
  };
});

vi.mock('@interdomestik/database', () => ({
  agentClients: mocks.agentClients,
  claims: mocks.claims,
  db: mocks.db,
  desc: mocks.desc,
  eq: mocks.eq,
  ilike: mocks.ilike,
  or: mocks.or,
  and: mocks.and,
  sql: mocks.sql,
  user: mocks.user,
}));

import { getAgentMembersList } from './get-agent-members-list';

describe('getAgentMembersList', () => {
  beforeEach(() => {
    mocks.db.select.mockReturnValue(mocks.chain);
    mocks.chain.from.mockReturnValue(mocks.chain);
    mocks.chain.innerJoin.mockReturnValue(mocks.chain);
    mocks.chain.leftJoin.mockReturnValue(mocks.chain);
    mocks.chain.where.mockReturnValue(mocks.chain);
    mocks.chain.groupBy.mockReturnValue(mocks.chain);
    mocks.chain.orderBy.mockReturnValue(mocks.chain);
  });

  it('returns members when query matches name', async () => {
    mocks.chain.limit.mockResolvedValue([
      {
        memberId: 'member-1',
        name: 'Arben Krasniqi',
        membershipNumber: 'MEM-2026-000002',
        userUpdatedAt: new Date('2026-01-01T00:00:00Z'),
        joinedAt: new Date('2026-01-01T00:00:00Z'),
        activeClaimsCount: 0,
        lastClaimUpdatedAt: null,
      },
    ]);

    const result = await getAgentMembersList({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      query: 'Arb',
    });

    expect(mocks.ilike).toHaveBeenCalledWith(mocks.user.name, '%Arb%');
    expect(mocks.ilike).toHaveBeenCalledWith(mocks.user.memberNumber, '%Arb%');
    expect(mocks.or).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.agentId, 'agent-1');
    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.tenantId, 'tenant-1');
    expect(result.members).toHaveLength(1);
    expect(result.members[0].name).toBe('Arben Krasniqi');
  });

  it('returns members when query matches membership number', async () => {
    mocks.chain.limit.mockResolvedValue([
      {
        memberId: 'member-2',
        name: 'Mira Dervishi',
        membershipNumber: 'MEM-2026-000010',
        userUpdatedAt: new Date('2026-01-02T00:00:00Z'),
        joinedAt: new Date('2026-01-02T00:00:00Z'),
        activeClaimsCount: 1,
        lastClaimUpdatedAt: new Date('2026-01-03T00:00:00Z'),
      },
    ]);

    const result = await getAgentMembersList({
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      query: '000010',
    });

    expect(mocks.ilike).toHaveBeenCalledWith(mocks.user.memberNumber, '%000010%');
    expect(result.members).toHaveLength(1);
    expect(result.members[0].membershipNumber).toBe('MEM-2026-000010');
  });

  it('returns empty when query matches nothing', async () => {
    mocks.chain.limit.mockResolvedValue([]);

    const result = await getAgentMembersList({
      agentId: 'agent-2',
      tenantId: 'tenant-2',
      query: 'zzz',
    });

    expect(result.members).toEqual([]);
  });

  it('enforces tenant scoping', async () => {
    mocks.chain.limit.mockResolvedValue([]);

    await getAgentMembersList({
      agentId: 'agent-3',
      tenantId: 'tenant-3',
    });

    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.tenantId, 'tenant-3');
  });
});
