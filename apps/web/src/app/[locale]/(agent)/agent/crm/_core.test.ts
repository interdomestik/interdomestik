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
    id: 'crmLeads.id',
    tenantId: 'crmLeads.tenantId',
    agentId: 'crmLeads.agentId',
    stage: 'crmLeads.stage',
    fullName: 'crmLeads.fullName',
    companyName: 'crmLeads.companyName',
  },
  crmActivities: {
    id: 'crmActivities.id',
    tenantId: 'crmActivities.tenantId',
    agentId: 'crmActivities.agentId',
    leadId: 'crmActivities.leadId',
    type: 'crmActivities.type',
    summary: 'crmActivities.summary',
    description: 'crmActivities.description',
    occurredAt: 'crmActivities.occurredAt',
    scheduledAt: 'crmActivities.scheduledAt',
    completedAt: 'crmActivities.completedAt',
    createdAt: 'crmActivities.createdAt',
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
  asc: vi.fn((col: unknown) => ({ asc: col })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  isNull: vi.fn((col: unknown) => ({ isNull: col })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  lte: vi.fn((a: unknown, b: unknown) => ({ lte: [a, b] })),
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

function createDueFollowUpsChain(result: unknown) {
  const afterOrderBy = { limit: vi.fn().mockResolvedValue(result) };
  const afterWhere = { orderBy: vi.fn().mockReturnValue(afterOrderBy) };
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(afterWhere),
    afterWhere,
    afterOrderBy,
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
      .mockReturnValueOnce(createSelectChain([{ total: null }]))
      .mockReturnValueOnce(createDueFollowUpsChain([]));

    const stats = await getAgentCrmStatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' });

    expect(stats).toEqual({
      newLeadsCount: 0,
      contactedLeadsCount: 0,
      closedWonDealsCount: 0,
      paidCommissionTotal: 0,
      dueFollowUps: [],
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
      .mockReturnValueOnce(createSelectChain([{ total: '123.45' }]))
      .mockReturnValueOnce(
        createDueFollowUpsChain([
          {
            activityId: 'activity-1',
            agentId: 'agent-1',
            completedAt: null,
            companyName: null,
            createdAt: new Date('2026-05-10T08:00:00.000Z'),
            description: null,
            fullName: 'Lead One',
            leadId: 'lead-1',
            occurredAt: new Date('2026-05-10T08:00:00.000Z'),
            scheduledAt: new Date('2020-01-01T10:00:00.000Z'),
            subject: 'Call back',
            tenantId: 'tenant-1',
            type: 'follow_up',
          },
        ])
      );

    const stats = await getAgentCrmStatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' });

    expect(stats).toEqual({
      newLeadsCount: 3,
      contactedLeadsCount: 7,
      closedWonDealsCount: 2,
      paidCommissionTotal: 123.45,
      dueFollowUps: [
        {
          activityId: 'activity-1',
          leadId: 'lead-1',
          leadName: 'Lead One',
          scheduledAt: '2020-01-01T10:00:00.000Z',
          subject: 'Call back',
        },
      ],
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
    const dueFollowUpsChain = createDueFollowUpsChain([]);

    hoisted.dbSelect
      .mockReturnValueOnce(leadChain)
      .mockReturnValueOnce(dealsChain)
      .mockReturnValueOnce(commissionChain)
      .mockReturnValueOnce(dueFollowUpsChain);

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

    expect(dueFollowUpsChain.where).toHaveBeenCalledWith({
      and: [
        { eq: ['crmActivities.tenantId', 'tenant-1'] },
        { eq: ['crmActivities.agentId', 'agent-1'] },
        { eq: ['crmLeads.tenantId', 'tenant-1'] },
        { eq: ['crmActivities.type', 'follow_up'] },
        { isNull: 'crmActivities.completedAt' },
        { lte: ['crmActivities.scheduledAt', expect.any(Date)] },
      ],
    });
    expect(dueFollowUpsChain.afterWhere.orderBy).toHaveBeenCalledWith({
      asc: 'crmActivities.scheduledAt',
    });
    expect(dueFollowUpsChain.afterOrderBy.limit).toHaveBeenCalledWith(5);
  });
});
