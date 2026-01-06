import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentLeaderboardCore } from './get.core';

// Mock DB
vi.mock('@interdomestik/database', () => {
  const mockQueryUser = {
    findFirst: vi.fn(),
  };

  return {
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      query: {
        user: mockQueryUser,
      },
    },
    agentCommissions: {
      agentId: 'ac_agentId',
      earnedAt: 'ac_earnedAt',
      tenantId: 'ac_tenantId',
      status: 'ac_status',
    },
    user: {
      id: 'u_id',
      name: 'u_name',
      image: 'u_image',
    },
  };
});

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn().mockReturnValue('tenant-1'),
}));

describe('getAgentLeaderboardCore', () => {
  const mockSession = { user: { id: 'agent1', role: 'agent', tenantId: 'tenant-1' } };

  beforeEach(() => {
    vi.clearAllMocks();
    (db.query.user.findFirst as any).mockResolvedValue({ name: 'Agent Name', image: 'u_image' });
  });

  it('should query db with correct filters for week', async () => {
    const mockDbResult = [{ agentId: 'a1', totalEarned: '100', dealCount: 5 }];
    (db.limit as any).mockResolvedValue(mockDbResult);

    const result = await getAgentLeaderboardCore({ session: mockSession, period: 'week' });

    expect(result.success).toBe(true);
    if (result.success) {
      // result.data contains { topAgents, currentUserRank, period }
      expect(result.data.topAgents).toHaveLength(1);
      expect(result.data.topAgents[0].agentId).toBe('a1');
    }
  });

  it('should handle db errors', async () => {
    (db.limit as any).mockRejectedValue(new Error('DB Fail'));

    const result = await getAgentLeaderboardCore({ session: mockSession, period: 'week' });
    expect(result).toEqual({ success: false, error: 'Failed to fetch leaderboard' });
  });
});
