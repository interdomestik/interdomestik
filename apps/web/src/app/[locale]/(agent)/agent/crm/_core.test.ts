import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    select: hoisted.dbSelect,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  crmLeads: { agentId: 'crmLeads.agentId', stage: 'crmLeads.stage' },
  crmDeals: { agentId: 'crmDeals.agentId', stage: 'crmDeals.stage' },
  agentCommissions: {
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
  it('returns numeric defaults when aggregates are null', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(createSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 0 }]))
      .mockReturnValueOnce(createSelectChain([{ total: null }]));

    const stats = await getAgentCrmStatsCore({ agentId: 'agent-1' });

    expect(stats).toEqual({
      newLeadsCount: 0,
      contactedLeadsCount: 0,
      closedWonDealsCount: 0,
      paidCommissionTotal: 0,
    });
  });

  it('maps counts and totals to a stable DTO', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(createSelectChain([{ count: 3 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 7 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 2 }]))
      .mockReturnValueOnce(createSelectChain([{ total: 123.45 }]));

    const stats = await getAgentCrmStatsCore({ agentId: 'agent-1' });

    expect(stats).toEqual({
      newLeadsCount: 3,
      contactedLeadsCount: 7,
      closedWonDealsCount: 2,
      paidCommissionTotal: 123.45,
    });
  });
});
