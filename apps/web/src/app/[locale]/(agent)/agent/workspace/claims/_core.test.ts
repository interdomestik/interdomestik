import { describe, expect, it, vi } from 'vitest';
import { getAgentWorkspaceClaimsCore } from './_core';

describe('getAgentWorkspaceClaimsCore', () => {
  const mockDb = {
    query: {
      claims: {
        findMany: vi.fn(),
      },
    },
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    selectDistinctOn: vi.fn().mockReturnThis(),
    orderBy: vi.fn(),
  };

  it('assembles claims with unread counts and snippets', async () => {
    const mockClaims = [
      {
        id: 'c1',
        claimNumber: 'CLM-001',
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
        user: { id: 'u1', name: 'User 1', email: 'u1@test.com' },
        branch: { name: 'Main' },
      },
    ];

    mockDb.query.claims.findMany.mockResolvedValue(mockClaims);

    // Mock for select (unread counts)
    mockDb.groupBy.mockResolvedValueOnce([{ claimId: 'c1', count: 5 }]);

    // Mock for selectDistinctOn (snippets)
    mockDb.orderBy.mockResolvedValueOnce([{ claimId: 'c1', content: 'hello' }]);

    const result = await getAgentWorkspaceClaimsCore({
      tenantId: 't1',
      userId: 'a1',
      db: mockDb,
    });

    expect(result.claims.length).toBe(1);
    expect(result.claims[0].unreadCount).toBe(5);
    expect(result.claims[0].lastMessage).toBe('hello');
    expect(result.claims[0].member?.name).toBe('User 1');
  });

  it('handles empty results gracefully', async () => {
    mockDb.query.claims.findMany.mockResolvedValue([]);
    const result = await getAgentWorkspaceClaimsCore({
      tenantId: 't1',
      userId: 'a1',
      db: mockDb,
    });
    expect(result.claims).toEqual([]);
  });
});
