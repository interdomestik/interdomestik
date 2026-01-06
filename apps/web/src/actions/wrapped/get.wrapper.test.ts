import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getWrappedStatsCore } from './get.core';

vi.mock('@interdomestik/database', () => {
  return {
    db: {
      query: {
        subscriptions: {
          findFirst: vi.fn(),
        },
        claims: {
          findMany: vi.fn(),
        },
      },
    },
    subscriptions: { userId: 's_userId' },
    claims: { userId: 'c_userId' },
  };
});

// Mock constants separately if needed, but get.core.ts imports from @interdomestik/database/constants
vi.mock('@interdomestik/database/constants', () => ({
  CLAIM_STATUSES: ['draft', 'pending', 'resolved', 'rejected'],
}));

describe('getWrappedStatsCore', () => {
  const mockSession = { user: { id: 'u1', name: 'John' } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw Error if no session', async () => {
    await expect(getWrappedStatsCore({ session: null })).rejects.toThrow('Unauthorized');
  });

  it('should return null if no subscription', async () => {
    (db.query.subscriptions.findFirst as any).mockResolvedValue(null);
    const result = await getWrappedStatsCore({ session: mockSession as any });
    expect(result).toBeNull();
  });

  it('should return stats if subscription exists', async () => {
    const createdAt = new Date();
    createdAt.setFullYear(createdAt.getFullYear() - 1); // 1 year ago

    (db.query.subscriptions.findFirst as any).mockResolvedValue({
      planId: 'silver',
      createdAt: createdAt,
    });

    (db.query.claims.findMany as any).mockResolvedValue([
      { status: 'resolved', claimAmount: '1000' },
      { status: 'pending', claimAmount: '500' },
    ]);

    const result = await getWrappedStatsCore({ session: mockSession as any });

    expect(result).not.toBeNull();
    if (result) {
      expect(result.resolvedCount).toBe(1);
      // 'pending' is not draft, resolved, or rejected -> should be inProgress
      expect(result.inProgressCount).toBe(1);
      expect(result.totalRecovered).toBe(1000);
    }
  });
});
