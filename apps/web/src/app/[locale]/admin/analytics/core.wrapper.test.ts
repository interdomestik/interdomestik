import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeSuccessRate, getAdminAnalyticsDataCore, normalizeTotalsRow } from './_core';

type AnalyticsDbMock = {
  then: {
    mockImplementationOnce: (implementation: unknown) => AnalyticsDbMock['then'];
  };
};

vi.mock('@interdomestik/database', () => {
  const mockDbResult = {
    then: vi.fn(),
    catch: vi.fn(),
  };

  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    then: mockDbResult.then,
  };

  return {
    db: mockDb,
    claims: {
      claimAmount: 'claimAmount',
      status: 'status',
      category: 'category',
      userId: 'userId',
      tenantId: 'tenantId',
    },
    sql: (strings: TemplateStringsArray, ..._values: unknown[]) => strings[0],
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
      (db as unknown as AnalyticsDbMock).then
        .mockImplementationOnce(
          (cb: (rows: { sum: number; avg: number; count: number }[]) => unknown) =>
            cb([{ sum: 1000, avg: 500, count: 2 }])
        )
        .mockImplementationOnce((cb: (rows: { status: string; count: number }[]) => unknown) =>
          cb([{ status: 'resolved', count: 1 }])
        )
        .mockImplementationOnce((cb: (rows: { category: string; count: number }[]) => unknown) =>
          cb([{ category: 'test', count: 2 }])
        )
        .mockImplementationOnce((cb: (rows: { count: number }[]) => unknown) => cb([{ count: 1 }]));

      const result = await getAdminAnalyticsDataCore({ user: { tenantId: 'tenant-1' } });
      expect(result.totals.count).toBe(2);
      expect(result.successRate).toBe(50);
    });
  });
});
