import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllCommissionsCore } from './get-all';

// Create a flexible mock query builder that supports all potential chains
const mockQueryBuilder = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockReturnThis(),
  then: vi.fn(resolve => resolve([])), // Default logic
};

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => mockQueryBuilder),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentCommissions: {
    id: 'id',
    agentId: 'agentId',
    memberId: 'memberId',
    tenantId: 'tenantId',
    earnedAt: 'earnedAt',
  },
  user: {
    id: 'id',
    tenantId: 'tenantId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}));

describe('getAllCommissionsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  };

  const mockAgentSession = {
    user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
  };

  it('denies access for non-admin/staff', async () => {
    const result = await getAllCommissionsCore({
      session: mockAgentSession as any,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Admin or staff access required');
  });

  it('fetches commissions for admin', async () => {
    const mockCommissions = [
      {
        id: 'c1',
        agentId: 'a1',
        type: 'new',
        status: 'pending',
        amount: '100',
        earnedAt: new Date(),
      },
    ];
    const mockUsers = [{ id: 'a1', name: 'Agent One', email: 'agent@test.com' }];

    // Mock specific query chains
    // db.select is called twice.
    // 1st call: commissions query (has offset)
    // 2nd call: users query (has where, no offset)

    const commissionsChain = {
      ...mockQueryBuilder,
      then: vi.fn(resolve => resolve(mockCommissions)),
    };

    const usersChain = {
      ...mockQueryBuilder,
      then: vi.fn(resolve => resolve(mockUsers)),
    };

    (db.select as any).mockReturnValueOnce(commissionsChain).mockReturnValueOnce(usersChain);

    const result = await getAllCommissionsCore({
      session: mockAdminSession as any,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].id).toBe('c1');
      expect(result.data?.[0].agentName).toBe('Agent One');
    }
  });
});
