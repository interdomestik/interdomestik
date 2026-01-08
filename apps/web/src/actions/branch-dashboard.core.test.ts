import { describe, expect, it, vi } from 'vitest';

// Mock database before imports
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb: any = {
  query: {
    branches: {
      findFirst: vi.fn(),
    },
  },
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(),
        })),
      })),
      orderBy: vi.fn(),
    })),
  })),
};

vi.mock('@interdomestik/database/db', () => ({
  db: mockDb,
}));

vi.mock('@interdomestik/database/schema', () => ({
  branches: { id: 'branches.id', tenantId: 'branches.tenantId' },
  user: {
    id: 'user.id',
    name: 'user.name',
    branchId: 'user.branchId',
    tenantId: 'user.tenantId',
    role: 'user.role',
  },
  claims: {
    branchId: 'claims.branchId',
    tenantId: 'claims.tenantId',
    createdAt: 'claims.createdAt',
    agentId: 'claims.agentId',
    status: 'claims.status',
  },
  agentClients: {
    agentId: 'agentClients.agentId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args) => args),
  eq: vi.fn((a, b) => [a, b]),
  count: vi.fn(() => 'count'),
  gte: vi.fn((a, b) => [a, b]),
  desc: vi.fn(a => a),
  sql: vi.fn(() => ({ as: vi.fn(() => 'sql_column') })),
  notInArray: vi.fn((a, b) => [a, b]),
}));

describe('Branch Dashboard Core', () => {
  describe('getBranchById', () => {
    it('returns null for non-existent branch', async () => {
      mockDb.query.branches.findFirst.mockResolvedValue(null);

      const { getBranchById } = await import('./branch-dashboard.core');
      const result = await getBranchById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });

    it('returns branch metadata when found', async () => {
      const mockBranch = {
        id: 'branch-1',
        name: 'Prishtina',
        code: 'PRZ',
        isActive: true,
        tenantId: 'tenant-1',
      };
      mockDb.query.branches.findFirst.mockResolvedValue(mockBranch);

      const { getBranchById } = await import('./branch-dashboard.core');
      const result = await getBranchById('branch-1', 'tenant-1');

      expect(result).toEqual({
        id: 'branch-1',
        name: 'Prishtina',
        code: 'PRZ',
        isActive: true,
        tenantId: 'tenant-1',
      });
    });

    it('respects tenant scoping', async () => {
      mockDb.query.branches.findFirst.mockResolvedValue(null);

      const { getBranchById } = await import('./branch-dashboard.core');
      await getBranchById('branch-1', 'wrong-tenant');

      expect(mockDb.query.branches.findFirst).toHaveBeenCalled();
    });
  });

  describe('getBranchStats', () => {
    it('returns zero counts when no data', async () => {
      // Mock Promise.all queries returning empty counts
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => [{ count: 0 }]),
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => [{ count: 0 }]),
          })),
        })),
      }));

      mockDb.select = mockSelect;

      const { getBranchStats } = await import('./branch-dashboard.core');
      const result = await getBranchStats('branch-1', 'tenant-1');

      expect(result.totalAgents).toBe(0);
      expect(result.totalMembers).toBe(0);
      expect(result.totalClaimsAllTime).toBe(0);
      expect(result.claimsThisMonth).toBe(0);
    });
  });

  describe('getBranchAgents', () => {
    it('returns empty array when no agents in branch', async () => {
      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => []),
          })),
        })),
      }));

      mockDb.select = mockSelect;

      const { getBranchAgents } = await import('./branch-dashboard.core');
      const result = await getBranchAgents('branch-1', 'tenant-1');

      expect(result).toEqual([]);
    });

    it('returns correct agent counts with seeded data', async () => {
      // Deterministic seeded data:
      // - 2 agents with known member/claim counts
      const seededAgents = [
        {
          agentId: 'agent-1',
          agentName: 'Agent Alpha',
          memberCount: 5,
          activeClaimCount: 3,
          submittedClaimsLast30Days: 7,
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent Beta',
          memberCount: 8,
          activeClaimCount: 1,
          submittedClaimsLast30Days: 4,
        },
      ];

      const mockSelect = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => seededAgents),
          })),
        })),
      }));

      mockDb.select = mockSelect;

      const { getBranchAgents } = await import('./branch-dashboard.core');
      const result = await getBranchAgents('branch-1', 'tenant-1');

      // Assert exact values match seeded data
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        agentId: 'agent-1',
        agentName: 'Agent Alpha',
        memberCount: 5,
        activeClaimCount: 3,
        submittedClaimsLast30Days: 7,
      });
      expect(result[1]).toEqual({
        agentId: 'agent-2',
        agentName: 'Agent Beta',
        memberCount: 8,
        activeClaimCount: 1,
        submittedClaimsLast30Days: 4,
      });

      // Verify totals would be: 13 members, 4 active claims, 11 submitted
      const totalMembers = result.reduce((sum, a) => sum + a.memberCount, 0);
      const totalActive = result.reduce((sum, a) => sum + a.activeClaimCount, 0);
      expect(totalMembers).toBe(13);
      expect(totalActive).toBe(4);
    });
  });
});
