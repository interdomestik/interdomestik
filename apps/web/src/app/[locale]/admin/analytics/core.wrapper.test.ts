import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeSuccessRate, getAdminAnalyticsDataCore, normalizeTotalsRow } from './_core';

vi.mock('@interdomestik/database', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    // Drizzle select().from() returns a Promise-like
    then: vi.fn(),
    catch: vi.fn(),
  };
  // Make it chainable and awaitable
  mockDb.select.mockReturnValue(mockDb);
  mockDb.from.mockReturnValue(mockDb);
  mockDb.groupBy.mockReturnValue(mockDb);

  return {
    db: mockDb,
    claims: {
      claimAmount: 'claimAmount',
      status: 'status',
      category: 'category',
      userId: 'userId',
    },
    sql: (strings: any, ...values: any[]) => strings[0],
  };
});

describe('admin analytics _core', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeSuccessRate', () => {
    it('calculates correctly', () => {
      const rate = computeSuccessRate({
        totalsCount: 10,
        statusDistribution: [{ status: 'resolved', count: 5 }],
      });
      expect(rate).toBe(50);
    });
  });

  describe('normalizeTotalsRow', () => {
    it('normalizes nulls', () => {
      expect(normalizeTotalsRow()).toEqual({ sum: 0, avg: 0, count: 0 });
    });
  });

  describe('getAdminAnalyticsDataCore', () => {
    it('fetches data successfully', async () => {
      (db.then as any)
        .mockImplementationOnce((cb: any) => cb([{ sum: 1000, avg: 500, count: 2 }]))
        .mockImplementationOnce((cb: any) => cb([{ status: 'resolved', count: 1 }]))
        .mockImplementationOnce((cb: any) => cb([{ category: 'test', count: 2 }]))
        .mockImplementationOnce((cb: any) => cb([{ count: 1 }]));

      const result = await getAdminAnalyticsDataCore();
      expect(result.totals.count).toBe(2);
      expect(result.successRate).toBe(50);
    });
  });
});
