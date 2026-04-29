import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgentLeaderboardCore } from './get.core';

type LeaderboardRow = { agentId: string; totalEarned: string; dealCount: number };
type LeaderboardSelectChain = {
  from: () => {
    where: () => {
      groupBy: () => {
        orderBy: () => {
          limit: { mockReturnValue: (value: Promise<LeaderboardRow[]>) => unknown };
        };
      };
    };
  };
};

// Mock DB
vi.mock('@interdomestik/database', () => {
  const mockQueryUser = {
    findFirst: vi.fn(),
  };

  const limit = vi.fn().mockReturnValue(Promise.resolve([]));
  const orderBy = vi.fn().mockReturnValue({ limit });
  const groupBy = vi.fn().mockReturnValue({ orderBy });
  const where = vi.fn().mockReturnValue({ groupBy });
  const from = vi.fn().mockReturnValue({ where });

  return {
    db: {
      select: vi.fn().mockReturnValue({
        from,
      }),
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
    eq: vi.fn(),
    and: vi.fn(),
    desc: vi.fn(),
    sql: vi.fn(s => s[0]),
  };
});

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn().mockReturnValue('tenant-1'),
}));

describe('getAgentLeaderboardCore', () => {
  const mockSession = {
    session: {
      id: 'sess1',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'agent1',
      expiresAt: new Date(Date.now() + 3600000),
      token: 'token1',
    },
    user: {
      id: 'agent1',
      role: 'agent',
      tenantId: 'tenant-1',
      email: 'a@test.com',
      emailVerified: true,
      name: 'Agent',
      memberNumber: 'M1',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.user.findFirst).mockResolvedValue({
      name: 'Agent Name',
      image: 'u_image',
    } as never);
  });

  it('should query db with correct filters for week', async () => {
    const mockDbResult = [{ agentId: 'a1', totalEarned: '100', dealCount: 5 }];
    // The chain ends with .limit() which returns our resultObj.
    // We need to override the then for this specific call.
    (db.select() as unknown as LeaderboardSelectChain)
      .from()
      .where()
      .groupBy()
      .orderBy()
      .limit.mockReturnValue(Promise.resolve(mockDbResult));

    const result = await getAgentLeaderboardCore({ session: mockSession as never, period: 'week' });

    expect(result.success).toBe(true);
    if (result.success) {
      // result.data contains { topAgents, currentUserRank, period }
      expect(result.data.topAgents).toHaveLength(1);
      expect(result.data.topAgents[0].agentId).toBe('a1');
    }
  });

  it('should handle db errors', async () => {
    (db.select() as unknown as LeaderboardSelectChain)
      .from()
      .where()
      .groupBy()
      .orderBy()
      .limit.mockReturnValue(Promise.reject(new Error('DB Fail')));

    const result = await getAgentLeaderboardCore({ session: mockSession as never, period: 'week' });
    expect(result).toEqual({ success: false, error: 'Failed to fetch leaderboard' });
  });
});
