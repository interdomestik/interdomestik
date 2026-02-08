import { claims, memberLeads } from '@interdomestik/database/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentDashboardLiteCore, getAgentDashboardV2StatsCore } from './_core';

describe('getAgentDashboardLiteCore', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  const services = { db: mockDb as any };

  beforeEach(() => {
    mockDb.select.mockClear();
    mockDb.from.mockClear();
    mockDb.where.mockReset();
  });

  it('calculates counts correctly for an agent', async () => {
    // Mock leads count
    mockDb.where.mockResolvedValueOnce([{ count: 5 }]);
    // Mock claims count
    mockDb.where.mockResolvedValueOnce([{ count: 3 }]);

    const result = await getAgentDashboardLiteCore({ agentId: 'agent-1' }, services);

    expect(result.newLeadsCount).toBe(5);
    expect(result.activeClaimsCount).toBe(3);
    expect(result.followUpsCount).toBe(0);

    // Verify lead query
    expect(mockDb.from).toHaveBeenCalledWith(memberLeads);
    // Verify claim query
    expect(mockDb.from).toHaveBeenCalledWith(claims);
  });

  it('handles empty results', async () => {
    mockDb.where.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([]);

    const result = await getAgentDashboardLiteCore({ agentId: 'agent-1' }, services);

    expect(result.newLeadsCount).toBe(0);
    expect(result.activeClaimsCount).toBe(0);
  });

  it('maps v2 KPI aggregates to numeric DTO fields', async () => {
    mockDb.where
      .mockResolvedValueOnce([{ count: '4' }])
      .mockResolvedValueOnce([{ count: '6' }])
      .mockResolvedValueOnce([{ count: '2' }])
      .mockResolvedValueOnce([{ total: '42.75' }])
      .mockResolvedValueOnce([{ count: '9' }]);

    const stats = await getAgentDashboardV2StatsCore({ agentId: 'agent-1' }, services);

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
});
