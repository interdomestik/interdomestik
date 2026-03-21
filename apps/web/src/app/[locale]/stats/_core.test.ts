import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    select: hoisted.dbSelect,
  },
  claims: {
    status: 'claims.status',
    claimAmount: 'claims.claimAmount',
  },
}));

vi.mock('drizzle-orm', () => ({
  count: vi.fn(() => 'count()'),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

import { getPublicStatsCore } from './_core';

type FromResult<T> = {
  from: () => Promise<T[]>;
};

function makeFromResult<T>(rows: T[]): FromResult<T> {
  return {
    from: async () => rows,
  };
}

describe('getPublicStatsCore', () => {
  it('calculates success rate and total recovered', async () => {
    hoisted.dbSelect.mockReturnValueOnce(
      makeFromResult([{ totalClaims: 10, resolvedClaims: 4, totalRecovered: '2000' }])
    );

    const stats = await getPublicStatsCore();

    expect(stats).toEqual({
      totalClaims: 10,
      resolvedClaims: 4,
      totalRecovered: 2000,
      successRate: 40,
      avgResponseTime: 24,
    });
  });

  it('returns successRate 0 when totalClaims is 0', async () => {
    hoisted.dbSelect.mockReturnValueOnce(
      makeFromResult([{ totalClaims: 0, resolvedClaims: 0, totalRecovered: '0' }])
    );

    const stats = await getPublicStatsCore();

    expect(stats.successRate).toBe(0);
  });

  it('rounds successRate', async () => {
    hoisted.dbSelect.mockReturnValueOnce(
      makeFromResult([{ totalClaims: 3, resolvedClaims: 2, totalRecovered: '0' }])
    );

    const stats = await getPublicStatsCore();

    expect(stats.successRate).toBe(67);
  });
});
