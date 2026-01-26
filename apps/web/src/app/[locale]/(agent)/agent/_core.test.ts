import { claims, memberFollowups, memberLeads } from '@interdomestik/database/schema';
import { describe, expect, it, vi } from 'vitest';
import { getAgentDashboardLiteCore } from './_core';

describe('getAgentDashboardLiteCore', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  };

  const services = { db: mockDb as any };

  it('calculates counts correctly for an agent', async () => {
    // Mock new leads count
    mockDb.where.mockResolvedValueOnce([{ count: 5 }]);
    // Mock active claims count
    mockDb.where.mockResolvedValueOnce([{ count: 3 }]);
    // Mock follow-ups count
    mockDb.where.mockResolvedValueOnce([{ count: 2 }]);

    const result = await getAgentDashboardLiteCore({ agentId: 'agent-1' }, services);

    expect(result.newLeadsCount).toBe(5);
    expect(result.activeClaimsCount).toBe(3);
    expect(result.followUpsCount).toBe(2);

    // Verify lead query
    expect(mockDb.from).toHaveBeenCalledWith(memberLeads);
    // Verify claim query
    expect(mockDb.from).toHaveBeenCalledWith(claims);
    // Verify follow-up query
    expect(mockDb.from).toHaveBeenCalledWith(memberFollowups);
  });

  it('handles empty results', async () => {
    mockDb.where.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([]);
    mockDb.where.mockResolvedValueOnce([]);

    const result = await getAgentDashboardLiteCore({ agentId: 'agent-1' }, services);

    expect(result.newLeadsCount).toBe(0);
    expect(result.activeClaimsCount).toBe(0);
  });
});
