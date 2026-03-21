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

type RejectingFromResult = {
  from: () => Promise<never>;
};

function makeFromResult<T>(rows: T[]): FromResult<T> {
  return {
    from: async () => rows,
  };
}

function makeRejectingFromResult(error: unknown): RejectingFromResult {
  return {
    from: async () => {
      throw error;
    },
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

  it('coerces aggregate stats values to numbers', async () => {
    hoisted.dbSelect.mockReturnValueOnce(
      makeFromResult([{ totalClaims: '10', resolvedClaims: '4', totalRecovered: '2000' }])
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

  it('retries once after a transient stats error', async () => {
    hoisted.dbSelect
      .mockReturnValueOnce(
        makeRejectingFromResult(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      )
      .mockReturnValueOnce(
        makeFromResult([{ totalClaims: 10, resolvedClaims: 4, totalRecovered: '2000' }])
      );

    const stats = await getPublicStatsCore();

    expect(stats.successRate).toBe(40);
    expect(hoisted.dbSelect).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-transient stats errors without retrying', async () => {
    const error = Object.assign(new Error('boom'), { code: 'EINVAL' });
    hoisted.dbSelect.mockReturnValueOnce(makeRejectingFromResult(error));

    await expect(getPublicStatsCore()).rejects.toThrow('boom');
    expect(hoisted.dbSelect).toHaveBeenCalledTimes(1);
  });
});
