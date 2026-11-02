import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Authorities the mocked public-statistics producer hands out, one per tenant.
const authorities = new Map<string, TenantAuthority>();
const authorityFor = (tenantId: string): TenantAuthority => {
  if (!authorities.has(tenantId)) authorities.set(tenantId, mintTestTenantAuthority(tenantId));
  return authorities.get(tenantId)!;
};

const hoisted = vi.hoisted(() => ({
  listTenantIds: vi.fn(),
  withTenantContext: vi.fn(),
  tenantRows: new Map<string, unknown>(),
  failure: { error: undefined as unknown, remaining: 0 },
  whereCalls: [] as unknown[],
}));

vi.mock('@interdomestik/database', () => ({
  withTenantContext: hoisted.withTenantContext,
  claims: {
    status: 'claims.status',
    caseLifecycleState: 'claims.caseLifecycleState',
    recoveryLifecycleState: 'claims.recoveryLifecycleState',
    claimAmount: 'claims.claimAmount',
    tenantId: 'claims.tenantId',
  },
  listPublicStatisticsWork: vi.fn(async () =>
    ((await hoisted.listTenantIds()) as string[]).map(tenantId => ({
      tenantId,
      authority: authorityFor(tenantId),
    }))
  ),
}));

vi.mock('drizzle-orm', () => ({
  count: vi.fn(() => 'count()'),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

import { getPublicStatsCore } from './_core';

type StatsRow = { totalClaims: unknown; resolvedClaims: unknown; totalRecovered: unknown };

function makeTx(rows: StatsRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          hoisted.whereCalls.push(clause);
          return Promise.resolve(rows);
        },
      }),
    }),
  };
}

describe('getPublicStatsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.tenantRows.clear();
    hoisted.whereCalls.length = 0;
    hoisted.failure.error = undefined;
    hoisted.failure.remaining = 0;
    hoisted.listTenantIds.mockReset();
    hoisted.withTenantContext.mockReset();
    hoisted.withTenantContext.mockImplementation(
      async (ctx: TenantAuthority, cb: (tx: unknown) => unknown) => {
        if (hoisted.failure.remaining > 0) {
          hoisted.failure.remaining -= 1;
          throw hoisted.failure.error;
        }
        const row = hoisted.tenantRows.get(readTenantAuthority(ctx).tenantId);
        return cb(makeTx(row ? [row as StatsRow] : []));
      }
    );
  });

  function seedTenant(
    tenantId: string,
    totalClaims: number | string,
    resolvedClaims: number | string,
    totalRecovered: string
  ) {
    hoisted.tenantRows.set(tenantId, { totalClaims, resolvedClaims, totalRecovered });
  }

  it('sums per-tenant counts and calculates success rate and total recovered', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a', 'tenant-b']);
    seedTenant('tenant-a', 6, 3, '1500');
    seedTenant('tenant-b', 4, 1, '500');

    const stats = await getPublicStatsCore();

    expect(stats).toEqual({
      totalClaims: 10,
      resolvedClaims: 4,
      totalRecovered: 2000,
      successRate: 40,
      avgResponseTime: 24,
    });
  });

  it('reads each tenant inside its own system tenant context with a tenant predicate', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a', 'tenant-b']);
    seedTenant('tenant-a', 1, 0, '0');
    seedTenant('tenant-b', 1, 0, '0');

    await getPublicStatsCore();

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    expect(hoisted.withTenantContext.mock.calls.map(call => call[0])).toEqual([
      authorityFor('tenant-a'),
      authorityFor('tenant-b'),
    ]);
    expect(hoisted.whereCalls).toEqual([
      { op: 'eq', left: 'claims.tenantId', right: 'tenant-a' },
      { op: 'eq', left: 'claims.tenantId', right: 'tenant-b' },
    ]);
  });

  it('returns zeros and reads no tenant data when there are no tenants', async () => {
    hoisted.listTenantIds.mockResolvedValue([]);

    const stats = await getPublicStatsCore();

    expect(stats).toEqual({
      totalClaims: 0,
      resolvedClaims: 0,
      totalRecovered: 0,
      successRate: 0,
      avgResponseTime: 24,
    });
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('returns successRate 0 when totalClaims is 0', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a']);
    seedTenant('tenant-a', 0, 0, '0');

    const stats = await getPublicStatsCore();

    expect(stats.successRate).toBe(0);
  });

  it('rounds successRate', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a']);
    seedTenant('tenant-a', 3, 2, '0');

    const stats = await getPublicStatsCore();

    expect(stats.successRate).toBe(67);
  });

  it('coerces aggregate stats values to numbers', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a']);
    seedTenant('tenant-a', '10', '4', '2000');

    const stats = await getPublicStatsCore();

    expect(stats).toEqual({
      totalClaims: 10,
      resolvedClaims: 4,
      totalRecovered: 2000,
      successRate: 40,
      avgResponseTime: 24,
    });
  });

  it('treats a tenant with no stats row as zero', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a', 'tenant-empty']);
    seedTenant('tenant-a', 5, 5, '100');

    const stats = await getPublicStatsCore();

    expect(stats.totalClaims).toBe(5);
    expect(stats.successRate).toBe(100);
  });

  it('retries once after a transient stats error without double counting', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a', 'tenant-b']);
    seedTenant('tenant-a', 6, 3, '1500');
    seedTenant('tenant-b', 4, 1, '500');
    hoisted.failure.error = Object.assign(new Error('reset'), { code: 'ECONNRESET' });
    hoisted.failure.remaining = 1;

    const stats = await getPublicStatsCore();

    expect(stats).toMatchObject({ totalClaims: 10, resolvedClaims: 4, successRate: 40 });
    expect(hoisted.listTenantIds).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-transient stats errors without retrying', async () => {
    hoisted.listTenantIds.mockResolvedValue(['tenant-a']);
    hoisted.failure.error = Object.assign(new Error('boom'), { code: 'EINVAL' });
    hoisted.failure.remaining = 1;

    await expect(getPublicStatsCore()).rejects.toThrow('boom');
    expect(hoisted.listTenantIds).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('propagates a tenant list failure such as the tenant bound', async () => {
    hoisted.listTenantIds.mockRejectedValue(new Error('Platform aggregate exceeds 500 tenants'));

    await expect(getPublicStatsCore()).rejects.toThrow('exceeds 500 tenants');
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });
});
