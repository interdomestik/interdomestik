import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    tenantId: 'agentCommissions.tenantId',
    agentId: 'agentCommissions.agentId',
    status: 'agentCommissions.status',
    amount: 'agentCommissions.amount',
  },
  claims: {
    agentId: 'claims.agentId',
    status: 'claims.status',
  },
  crmDeals: {
    tenantId: 'crmDeals.tenantId',
    agentId: 'crmDeals.agentId',
    stage: 'crmDeals.stage',
  },
  crmLeads: {
    tenantId: 'crmLeads.tenantId',
    agentId: 'crmLeads.agentId',
    stage: 'crmLeads.stage',
  },
  memberLeads: {
    agentId: 'memberLeads.agentId',
    status: 'memberLeads.status',
  },
  subscriptions: {
    tenantId: 'subscriptions.tenantId',
    referredByAgentId: 'subscriptions.referredByAgentId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  count: vi.fn(() => ({ kind: 'count' })),
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ inArray: [col, vals] })),
  not: vi.fn((arg: unknown) => ({ not: arg })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ sql: { strings, values } }),
}));

import {
  agentCommissions,
  claims,
  crmDeals,
  crmLeads,
  memberLeads,
  subscriptions,
} from '@interdomestik/database/schema';

import {
  getAgentDashboardLiteCore,
  getAgentDashboardV2StatsCore,
  type AgentDashboardServices,
} from './_core';

describe('agent dashboard core', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  const services: AgentDashboardServices = { db: mockDb };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
  });

  describe('getAgentDashboardLiteCore', () => {
    it('calculates counts correctly for an agent', async () => {
      mockDb.where.mockResolvedValueOnce([{ count: 5 }]).mockResolvedValueOnce([{ count: 3 }]);

      const result = await getAgentDashboardLiteCore({ agentId: 'agent-1' }, services);

      expect(result.newLeadsCount).toBe(5);
      expect(result.activeClaimsCount).toBe(3);
      expect(result.followUpsCount).toBe(0);
      expect(mockDb.from).toHaveBeenCalledWith(memberLeads);
      expect(mockDb.from).toHaveBeenCalledWith(claims);
    });

    it('handles empty results', async () => {
      mockDb.where.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await getAgentDashboardLiteCore({ agentId: 'agent-1' }, services);

      expect(result.newLeadsCount).toBe(0);
      expect(result.activeClaimsCount).toBe(0);
    });
  });

  describe('getAgentDashboardV2StatsCore', () => {
    it('maps v2 KPI aggregates to numeric DTO fields', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ count: '4' }])
        .mockResolvedValueOnce([{ count: '6' }])
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([{ total: '42.75' }])
        .mockResolvedValueOnce([{ count: '9' }]);

      const stats = await getAgentDashboardV2StatsCore(
        { agentId: 'agent-1', tenantId: 'tenant-1' },
        services
      );

      expect(stats).toEqual({
        newLeads: 4,
        contactedLeads: 6,
        wonDeals: 2,
        totalPaidCommission: 42.75,
        clientCount: 9,
      });
      expect(typeof stats.newLeads).toBe('number');
      expect(typeof stats.contactedLeads).toBe('number');
      expect(typeof stats.wonDeals).toBe('number');
      expect(typeof stats.totalPaidCommission).toBe('number');
      expect(typeof stats.clientCount).toBe('number');
    });

    it('filters every tenant-bearing v2 KPI read by tenant and agent or referrer', async () => {
      mockDb.where
        .mockResolvedValueOnce([{ count: 1 }])
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([{ count: 3 }])
        .mockResolvedValueOnce([{ total: '4.50' }])
        .mockResolvedValueOnce([{ count: 5 }]);

      await getAgentDashboardV2StatsCore({ agentId: 'agent-1', tenantId: 'tenant-1' }, services);

      expect(mockDb.from.mock.calls).toEqual([
        [crmLeads],
        [crmLeads],
        [crmDeals],
        [agentCommissions],
        [subscriptions],
      ]);

      expect(mockDb.where.mock.calls[0]?.[0]).toEqual({
        and: [
          { eq: ['crmLeads.tenantId', 'tenant-1'] },
          { eq: ['crmLeads.agentId', 'agent-1'] },
          { eq: ['crmLeads.stage', 'new'] },
        ],
      });
      expect(mockDb.where.mock.calls[1]?.[0]).toEqual({
        and: [
          { eq: ['crmLeads.tenantId', 'tenant-1'] },
          { eq: ['crmLeads.agentId', 'agent-1'] },
          { eq: ['crmLeads.stage', 'contacted'] },
        ],
      });
      expect(mockDb.where.mock.calls[2]?.[0]).toEqual({
        and: [
          { eq: ['crmDeals.tenantId', 'tenant-1'] },
          { eq: ['crmDeals.agentId', 'agent-1'] },
          { eq: ['crmDeals.stage', 'closed_won'] },
        ],
      });
      expect(mockDb.where.mock.calls[3]?.[0]).toEqual({
        and: [
          { eq: ['agentCommissions.tenantId', 'tenant-1'] },
          { eq: ['agentCommissions.agentId', 'agent-1'] },
          { eq: ['agentCommissions.status', 'paid'] },
        ],
      });
      expect(mockDb.where.mock.calls[4]?.[0]).toEqual({
        and: [
          { eq: ['subscriptions.tenantId', 'tenant-1'] },
          { eq: ['subscriptions.referredByAgentId', 'agent-1'] },
        ],
      });
    });
  });
});
