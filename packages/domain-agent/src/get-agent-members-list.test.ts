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
    asc: vi.fn(value => ({ value, op: 'asc' })),
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
  asc: mocks.asc,
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
    expect(result.members[0].openClaimsCount).toBe(0);
    expect(result.members[0].attentionState).toBe('up_to_date');
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
    expect(result.members[0].openClaimsCount).toBe(1);
    expect(result.members[0].attentionState).toBe('needs_attention');
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

  it('enforces assignee + tenant + member role scope and deterministic ordering tie-break', async () => {
    mocks.chain.limit.mockResolvedValue([]);

    await getAgentMembersList({
      agentId: 'agent-4',
      tenantId: 'tenant-4',
    });

    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.agentId, 'agent-4');
    expect(mocks.eq).toHaveBeenCalledWith(mocks.agentClients.tenantId, 'tenant-4');
    expect(mocks.eq).toHaveBeenCalledWith(mocks.user.role, 'member');
    expect(mocks.asc).toHaveBeenCalledWith(mocks.agentClients.memberId);
  });

  it('supports deterministic pilot split (7 members for agent 1, 3 members for agent 2)', async () => {
    const now = new Date('2026-02-06T10:00:00.000Z');
    const pilotRowsAgent1 = [
      'Arta Krasniqi',
      'Blerina Gashi',
      'Donika Berisha',
      'Elira Hoxha',
      'Mimoza Shala',
      'Altin Kelmendi',
      'Besnik Rexhepi',
    ].map((name, idx) => ({
      memberId: `pilot-member-0${idx + 1}`,
      name,
      membershipNumber: `PILOT-PR-00000${idx + 1}`,
      userUpdatedAt: now,
      joinedAt: now,
      activeClaimsCount: 0,
      lastClaimUpdatedAt: null,
    }));
    const pilotRowsAgent2 = ['Driton Ahmeti', 'Fisnik Bytyqi', 'Luan Morina'].map((name, idx) => ({
      memberId: `pilot-member-0${idx + 8}`,
      name,
      membershipNumber: `PILOT-PR-00000${idx + 8}`,
      userUpdatedAt: now,
      joinedAt: now,
      activeClaimsCount: 0,
      lastClaimUpdatedAt: null,
    }));

    mocks.chain.limit
      .mockResolvedValueOnce(pilotRowsAgent1 as never)
      .mockResolvedValueOnce(pilotRowsAgent2 as never);

    const esetResult = await getAgentMembersList({
      agentId: 'golden_pilot_mk_agent',
      tenantId: 'pilot-mk',
    });
    const bekimResult = await getAgentMembersList({
      agentId: 'golden_pilot_mk_agent_2',
      tenantId: 'pilot-mk',
    });

    expect(esetResult.members).toHaveLength(7);
    expect(esetResult.members[0].name).toBe('Arta Krasniqi');
    expect(esetResult.members[6].name).toBe('Besnik Rexhepi');

    expect(bekimResult.members).toHaveLength(3);
    expect(bekimResult.members[0].name).toBe('Driton Ahmeti');
    expect(bekimResult.members[2].name).toBe('Luan Morina');
  });
});
