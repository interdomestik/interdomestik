import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, isNull, ne, or } from 'drizzle-orm';

import type { Session } from './context';
import { getAdminAnalyticsCore } from './get-admin';

type RevenueRow = { provider: string | null; price: string; interval: string };
type RevenuePredicate = (row: RevenueRow) => boolean;
const revenue = vi.hoisted(() => ({ rows: [] as RevenueRow[], where: vi.fn() }));

// Mock database
vi.mock('@interdomestik/database', () => {
  const queryBuilder = {
    leftJoin: vi.fn(() => ({
      where: revenue.where,
    })),
    where: vi.fn(() => ({
      then: (resolve: (value: { count: number }[]) => unknown) => resolve([{ count: 0 }]),
      groupBy: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  };
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
    })),
  };
  return {
    db,
    withTenantContext: async (_context: unknown, callback: (tx: typeof db) => unknown) =>
      callback(db),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  subscriptions: {
    id: 'subscriptions.id',
    planId: 'subscriptions.planId',
    planKey: 'subscriptions.planKey',
    tenantId: 'subscriptions.tenantId',
    status: 'subscriptions.status',
    provider: 'subscriptions.provider',
    createdAt: 'subscriptions.createdAt',
  },
  membershipPlans: {
    id: 'membershipPlans.id',
    tenantId: 'membershipPlans.tenantId',
    price: 'membershipPlans.price',
    interval: 'membershipPlans.interval',
  },
}));

vi.mock('@interdomestik/domain-membership-billing', () => ({
  getTenantMembershipLifecycleCounts: vi.fn(async () => ({
    total: 5,
    providerLifecycleTotal: 10,
    active: 1,
    trialing: 1,
    activeInGrace: 1,
    graceExpired: 0,
    scheduledCancel: 1,
    canceled: 1,
    none: 0,
    accessActive: 4,
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  isNull: vi.fn(
    () =>
      (row: RevenueRow): boolean =>
        row.provider === null
  ),
  ne: vi.fn(
    (_left: unknown, right: unknown) =>
      (row: RevenueRow): boolean =>
        row.provider !== null && row.provider !== right
  ),
  or: vi.fn(
    (...predicates: RevenuePredicate[]) =>
      (row: RevenueRow): boolean =>
        predicates.some(predicate => predicate(row))
  ),
  and: vi.fn(
    (...predicates: (RevenuePredicate | undefined)[]) =>
      (row: RevenueRow): boolean =>
        predicates.every(predicate => predicate === undefined || predicate(row))
  ),
  gte: vi.fn(),
  sql: vi.fn(),
  desc: vi.fn(),
  relations: vi.fn(),
}));

vi.mock('@/lib/roles.core', () => ({
  isStaffOrAdmin: vi.fn(role => role === 'admin' || role === 'staff'),
}));

const authority = mintTestTenantAuthority('tenant_mk');

describe('actions/analytics getAdminAnalyticsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revenue.rows = [];
    revenue.where.mockImplementation(async (predicate: RevenuePredicate) =>
      revenue.rows.filter(predicate)
    );
  });

  it('returns Unauthorized for non-staff/admin users', async () => {
    const result = await getAdminAnalyticsCore({
      session: { user: { id: 'u1', role: 'user' } } as never as NonNullable<Session>,
      authority,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('fails when tenantId is missing', async () => {
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: null },
      } as never as NonNullable<Session>,
      authority,
    });

    expect(result).toEqual({ success: false, error: 'Missing tenant context' });
  });

  it('fails with invalid query parameters (bad limit)', async () => {
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      } as never as NonNullable<Session>,
      authority,
      query: { limit: 1000 }, // Over max 365
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid query');
    }
  });

  it.each([
    ['paddle', 'year', 10],
    [null, 'year', 10],
    ['paddle', 'month', 120],
    ['group_sponsor', 'month', 0],
  ])('calculates MRR for provider %s and interval %s', async (provider, interval, expected) => {
    revenue.rows = [{ provider, interval, price: '120' }];
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      } as NonNullable<Session>,
      authority,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.mrr).toBe(expected);
  });

  it('succeeds with valid session and tenantId', async () => {
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      } as never as NonNullable<Session>,
      authority,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalMembers).toBe(5);
      expect(result.data.activeMembers).toBe(4);
      expect(result.data.churnRate).toBe(10);
    }
    expect(eq).toHaveBeenCalledWith('subscriptions.planKey', 'membershipPlans.id');
    expect(eq).toHaveBeenCalledWith('subscriptions.tenantId', 'membershipPlans.tenantId');
    expect(isNull).toHaveBeenCalledWith('subscriptions.provider');
    expect(ne).toHaveBeenCalledWith('subscriptions.provider', 'group_sponsor');
    expect(or).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
    expect(and).toHaveBeenCalled();
  });
});
