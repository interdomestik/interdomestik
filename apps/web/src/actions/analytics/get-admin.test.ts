import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

import type { Session } from './context';
import { getAdminAnalyticsCore } from './get-admin';

// Mock database
vi.mock('@interdomestik/database', () => {
  const queryBuilder = {
    leftJoin: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
    where: vi.fn(() => ({
      then: (resolve: any) => resolve([{ count: 0 }]),
      groupBy: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => queryBuilder),
      })),
    },
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  subscriptions: {
    id: 'subscriptions.id',
    planId: 'subscriptions.planId',
    planKey: 'subscriptions.planKey',
    tenantId: 'subscriptions.tenantId',
    status: 'subscriptions.status',
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
    active: 1,
    trialing: 1,
    activeInGrace: 1,
    graceExpired: 0,
    scheduledCancel: 1,
    canceled: 1,
    paused: 0,
    none: 0,
    accessActive: 4,
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  desc: vi.fn(),
  relations: vi.fn(),
}));

vi.mock('@/lib/roles.core', () => ({
  isStaffOrAdmin: vi.fn(role => role === 'admin' || role === 'staff'),
}));

describe('actions/analytics getAdminAnalyticsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Unauthorized for non-staff/admin users', async () => {
    const result = await getAdminAnalyticsCore({
      session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('fails when tenantId is missing', async () => {
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: null },
      } as unknown as NonNullable<Session>,
    });

    expect(result).toEqual({ success: false, error: 'Missing tenant context' });
  });

  it('fails with invalid query parameters (bad limit)', async () => {
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
      query: { limit: 1000 }, // Over max 365
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid query');
    }
  });

  it('succeeds with valid session and tenantId', async () => {
    const result = await getAdminAnalyticsCore({
      session: {
        user: { id: 'admin-1', role: 'admin', tenantId: 'tenant_mk' },
      } as unknown as NonNullable<Session>,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.totalMembers).toBe(5);
      expect(result.data.activeMembers).toBe(4);
      expect(result.data.churnRate).toBe(20);
    }
    expect(eq).toHaveBeenCalledWith('subscriptions.planKey', 'membershipPlans.id');
    expect(eq).toHaveBeenCalledWith('subscriptions.tenantId', 'membershipPlans.tenantId');
    expect(and).toHaveBeenCalled();
  });
});
