import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmLeads: {
    tenantId: 'crmLeads.tenantId',
    agentId: 'crmLeads.agentId',
    stage: 'crmLeads.stage',
  },
  crmDeals: {
    tenantId: 'crmDeals.tenantId',
    agentId: 'crmDeals.agentId',
    stage: 'crmDeals.stage',
  },
  agentCommissions: {
    tenantId: 'agentCommissions.tenantId',
    agentId: 'agentCommissions.agentId',
    status: 'agentCommissions.status',
    amount: 'agentCommissions.amount',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  count: vi.fn(() => ({ kind: 'count' })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: { strings, values } }),
}));

import { getAgentCrmStatsCore } from './_core';

function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

describe('getAgentCrmStatsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns numeric defaults when aggregates are null', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(createSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ total: null }]));

    const stats = await getAgentCrmStatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' });

    expect(stats).toEqual({
      newLeadsCount: 0,
      contactedLeadsCount: 0,
      closedWonDealsCount: 0,
      paidCommissionTotal: 0,
    });
  });

  it('maps counts and totals to a stable numeric DTO', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(createSelectChain([{ count: '3' }]))
      .mockReturnValueOnce(createSelectChain([{ count: '7' }]))
      .mockReturnValueOnce(createSelectChain([{ count: '2' }]))
      .mockReturnValueOnce(createSelectChain([{ total: '123.45' }]));

    const stats = await getAgentCrmStatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' });

    expect(stats).toEqual({
      newLeadsCount: 3,
      contactedLeadsCount: 7,
      closedWonDealsCount: 2,
      paidCommissionTotal: 123.45,
    });
    expect(typeof stats.newLeadsCount).toBe('number');
    expect(typeof stats.contactedLeadsCount).toBe('number');
    expect(typeof stats.closedWonDealsCount).toBe('number');
    expect(typeof stats.paidCommissionTotal).toBe('number');
  });

  it('filters every tenant-bearing CRM aggregate by tenant and agent', async () => {
    const chains = [
      createSelectChain([{ count: 1 }]),
      createSelectChain([{ count: 2 }]),
      createSelectChain([{ count: 3 }]),
      createSelectChain([{ total: '4.50' }]),
    ];
    for (const chain of chains) {
      hoisted.dbSelect.mockReturnValueOnce(chain);
    }

    await getAgentCrmStatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' });

    expect(chains[0].where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmLeads.tenantId', 'tenant-1'] },
        { eq: ['crmLeads.agentId', 'agent-1'] },
        { eq: ['crmLeads.stage', 'new'] },
      ],
    });
    expect(chains[1].where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmLeads.tenantId', 'tenant-1'] },
        { eq: ['crmLeads.agentId', 'agent-1'] },
        { eq: ['crmLeads.stage', 'contacted'] },
      ],
    });
    expect(chains[2].where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmDeals.tenantId', 'tenant-1'] },
        { eq: ['crmDeals.agentId', 'agent-1'] },
        { eq: ['crmDeals.stage', 'closed_won'] },
      ],
    });
    expect(chains[3].where).toHaveBeenCalledWith({
      and: [
        { eq: ['agentCommissions.tenantId', 'tenant-1'] },
        { eq: ['agentCommissions.agentId', 'agent-1'] },
        { eq: ['agentCommissions.status', 'paid'] },
      ],
    });
  });
});
