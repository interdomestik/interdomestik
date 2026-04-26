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
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  count: vi.fn(() => ({ kind: 'count' })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: { strings, values } }),
}));

import { getAgentCrmStatsCore } from './_core';

/** Terminal at .where() – for crmDeals and agentCommissions queries */
function createSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

/** Terminal at .groupBy() – for the combined crmLeads count query */
function createGroupByChain(result: unknown) {
  const afterWhere = { groupBy: vi.fn().mockResolvedValue(result) };
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterWhere,
  };
}

describe('getAgentCrmStatsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns numeric defaults when aggregates are null', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(createGroupByChain([]))
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
      .mockReturnValueOnce(
        createGroupByChain([
          { stage: 'new', count: '3' },
          { stage: 'contacted', count: '7' },
        ])
      )
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
    const leadChain = createGroupByChain([
      { stage: 'new', count: 1 },
      { stage: 'contacted', count: 2 },
    ]);
    const dealsChain = createSelectChain([{ count: 3 }]);
    const commissionChain = createSelectChain([{ total: '4.50' }]);

    hoisted.dbSelect
      .mockReturnValueOnce(leadChain)
      .mockReturnValueOnce(dealsChain)
      .mockReturnValueOnce(commissionChain);

    await getAgentCrmStatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' });

    // crmLeads: combined new+contacted query uses inArray and groupBy
    expect(leadChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmLeads.tenantId', 'tenant-1'] },
        { eq: ['crmLeads.agentId', 'agent-1'] },
        { inArray: ['crmLeads.stage', ['new', 'contacted']] },
      ],
    });
    expect(leadChain.afterWhere.groupBy).toHaveBeenCalledWith('crmLeads.stage');

    // crmDeals: unchanged single-stage filter
    expect(dealsChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmDeals.tenantId', 'tenant-1'] },
        { eq: ['crmDeals.agentId', 'agent-1'] },
        { eq: ['crmDeals.stage', 'closed_won'] },
      ],
    });

    // agentCommissions: unchanged
    expect(commissionChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['agentCommissions.tenantId', 'tenant-1'] },
        { eq: ['agentCommissions.agentId', 'agent-1'] },
        { eq: ['agentCommissions.status', 'paid'] },
      ],
    });
  });
});
