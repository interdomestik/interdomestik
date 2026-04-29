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
    subscriptions: { userId: 's_userId', tenantId: 's_tenantId' },
    claims: { userId: 'c_userId', tenantId: 'c_tenantId' },
  };
});

// Mock constants separately if needed, but get.core.ts imports from @interdomestik/database/constants
vi.mock('@interdomestik/database/constants', () => ({
  CLAIM_STATUSES: ['draft', 'pending', 'resolved', 'rejected'],
}));

describe('getWrappedStatsCore', () => {
  const mockSession = { user: { id: 'u1', name: 'John', tenantId: 'tenant_ks' } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw Error if no session', async () => {
    await expect(getWrappedStatsCore({ session: null })).rejects.toThrow('Unauthorized');
  });

  it('should throw when tenant context is missing', async () => {
    await expect(
      getWrappedStatsCore({
        session: { user: { id: 'u1', name: 'John', tenantId: null } } as never,
      })
    ).rejects.toThrow('Session missing tenantId. Data integrity issue.');
    expect(db.query.subscriptions.findFirst).not.toHaveBeenCalled();
    expect(db.query.claims.findMany).not.toHaveBeenCalled();
  });

  it('should return null if no subscription', async () => {
    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue(null as never);
    const result = await getWrappedStatsCore({ session: mockSession as never });
    expect(result).toBeNull();
  });

  it('should return stats if subscription exists', async () => {
    const createdAt = new Date();
    createdAt.setFullYear(createdAt.getFullYear() - 1); // 1 year ago

    vi.mocked(db.query.subscriptions.findFirst).mockResolvedValue({
      planId: 'silver',
      createdAt: createdAt,
    } as never);

    vi.mocked(db.query.claims.findMany).mockResolvedValue([
      { status: 'resolved', claimAmount: '1000' },
      { status: 'pending', claimAmount: '500' },
    ] as never);

    const result = await getWrappedStatsCore({ session: mockSession as never });

    expect(result).not.toBeNull();
    if (result) {
      expect(result.resolvedCount).toBe(1);
      // 'pending' is not draft, resolved, or rejected -> should be inProgress
      expect(result.inProgressCount).toBe(1);
      expect(result.totalRecovered).toBe(1000);
    }
  });
});
