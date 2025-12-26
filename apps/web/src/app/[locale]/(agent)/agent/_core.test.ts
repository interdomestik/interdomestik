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
  agentCommissions: {
    amount: 'agentCommissions.amount',
    agentId: 'agentCommissions.agentId',
    status: 'agentCommissions.status',
  },
  crmDeals: {
    agentId: 'crmDeals.agentId',
    stage: 'crmDeals.stage',
  },
  crmLeads: {
    agentId: 'crmLeads.agentId',
    stage: 'crmLeads.stage',
  },
  subscriptions: {
    referredByAgentId: 'subscriptions.referredByAgentId',
  },
}));

vi.mock('@interdomestik/database/constants', () => ({}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  count: vi.fn(() => 'count()'),
  eq: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

import { getAgentDashboardStatsCore } from './_core';

type FromWhereResult<T> = {
  from: () => {
    where: () => Promise<T[]>;
  };
};

function makeFromWhereResult<T>(rows: T[]): FromWhereResult<T> {
  return {
    from: () => ({
      where: async () => rows,
    }),
  };
}

describe('getAgentDashboardStatsCore', () => {
  it('returns counts and totals', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(makeFromWhereResult([{ count: 2 }]))
      .mockReturnValueOnce(makeFromWhereResult([{ count: 5 }]))
      .mockReturnValueOnce(makeFromWhereResult([{ count: 1 }]))
      .mockReturnValueOnce(makeFromWhereResult([{ total: 12.34 }]))
      .mockReturnValueOnce(makeFromWhereResult([{ count: 9 }]));

    const stats = await getAgentDashboardStatsCore({ agentId: 'agent-1' });

    expect(stats).toEqual({
      newLeads: 2,
      contactedLeads: 5,
      wonDeals: 1,
      totalPaidCommission: 12.34,
      clientCount: 9,
    });
  });

  it('defaults missing rows to zero', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(makeFromWhereResult([]))
      .mockReturnValueOnce(makeFromWhereResult([]))
      .mockReturnValueOnce(makeFromWhereResult([]))
      .mockReturnValueOnce(makeFromWhereResult([]))
      .mockReturnValueOnce(makeFromWhereResult([]));

    const stats = await getAgentDashboardStatsCore({ agentId: 'agent-1' });

    expect(stats).toEqual({
      newLeads: 0,
      contactedLeads: 0,
      wonDeals: 0,
      totalPaidCommission: 0,
      clientCount: 0,
    });
  });
});
