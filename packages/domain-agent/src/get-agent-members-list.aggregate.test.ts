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

  return {
    chain,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    asc: vi.fn(value => value),
    desc: vi.fn(value => value),
    eq: vi.fn((left, right) => ({ left, right })),
    and: vi.fn((...conditions) => ({ conditions })),
    ilike: vi.fn(),
    or: vi.fn(),
    claimLifecycleStatusIn: vi.fn((statuses: readonly string[]) => ({ statuses })),
    agentClients: {
      agentId: 'agent_clients.agent_id',
      joinedAt: 'agent_clients.joined_at',
      memberId: 'agent_clients.member_id',
      status: 'agent_clients.status',
      tenantId: 'agent_clients.tenant_id',
    },
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
    },
    db: { select: vi.fn() },
    tx: { select: vi.fn() },
    withTenantContext: vi.fn(),
    user: {
      id: 'user.id',
      memberNumber: 'user.member_number',
      name: 'user.name',
      role: 'user.role',
      updatedAt: 'user.updated_at',
    },
  };
});

vi.mock('@interdomestik/database', () => ({
  agentClients: mocks.agentClients,
  and: mocks.and,
  asc: mocks.asc,
  claims: mocks.claims,
  db: mocks.db,
  desc: mocks.desc,
  eq: mocks.eq,
  ilike: mocks.ilike,
  or: mocks.or,
  sql: mocks.sql,
  user: mocks.user,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/domain-claims/claims/lifecycle-read-sql', () => ({
  claimLifecycleStatusIn: mocks.claimLifecycleStatusIn,
}));

import { getAgentMembersList } from './get-agent-members-list';

describe('getAgentMembersList aggregate query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => callback(mocks.tx)
    );
    mocks.tx.select.mockReturnValue(mocks.chain);
    mocks.chain.from.mockReturnValue(mocks.chain);
    mocks.chain.innerJoin.mockReturnValue(mocks.chain);
    mocks.chain.leftJoin.mockReturnValue(mocks.chain);
    mocks.chain.where.mockReturnValue(mocks.chain);
    mocks.chain.groupBy.mockReturnValue(mocks.chain);
    mocks.chain.orderBy.mockReturnValue(mocks.chain);
    mocks.chain.limit.mockResolvedValue([]);
  });

  it('does not count the synthetic null claim row from the left join as active draft', async () => {
    await getAgentMembersList({
      agentId: 'agent-zero-claims',
      tenantId: 'tenant-1',
      role: 'agent',
    });

    const aggregateCall = mocks.sql.mock.calls.find(([strings]) =>
      Array.from(strings).join('').includes('coalesce(sum(case when')
    );

    expect(aggregateCall).toBeDefined();
    expect(Array.from(aggregateCall?.[0] ?? []).join('')).toContain('is not null');
    expect(aggregateCall?.[1]).toBe(mocks.claims.id);
    expect(mocks.claimLifecycleStatusIn).toHaveBeenCalledWith([
      'draft',
      'submitted',
      'verification',
      'evaluation',
      'negotiation',
      'court',
    ]);
  });

  it('runs the aggregate through the tenant transaction with the home-tenant claim relation', async () => {
    await getAgentMembersList({ agentId: 'agent-1', tenantId: 'tenant-mk', role: 'agent' });

    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext.mock.calls[0]?.[0]).toStrictEqual({
      tenantId: 'tenant-mk',
      role: 'agent',
    });
    expect(mocks.tx.select).toHaveBeenCalledTimes(1);
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.chain.leftJoin).toHaveBeenCalledWith(mocks.claims, {
      conditions: [
        { left: mocks.claims.userId, right: mocks.user.id },
        { left: mocks.claims.tenantId, right: mocks.agentClients.tenantId },
      ],
    });
  });
});
