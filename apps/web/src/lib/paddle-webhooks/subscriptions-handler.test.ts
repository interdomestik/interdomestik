import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn((_vals?: unknown) => ({ onConflictDoUpdate: vi.fn(async () => undefined) })),
  selectResults: [] as unknown[][],
  findSubscription: vi.fn<() => Promise<Record<string, unknown> | null>>(() =>
    Promise.resolve(null)
  ),
  findUser: vi.fn<() => Promise<Record<string, unknown> | null>>(() => Promise.resolve(null)),
  findTenantSetting: vi.fn<() => Promise<Record<string, unknown> | null>>(() =>
    Promise.resolve(null)
  ),
  findMembershipPlan: vi.fn<() => Promise<Record<string, unknown> | null>>(() =>
    Promise.resolve(null)
  ),
  findReferral: vi.fn<() => Promise<Record<string, unknown> | null>>(() => Promise.resolve(null)),
  createMemberReferralReward: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { kind: 'no-op', created: false, reason: 'no_referral' },
    })
  ),
}));

vi.mock('@interdomestik/database', async () => {
  const helper = await import('@/test/canonical-membership-db-mock');

  return {
    and: vi.fn((...conditions: unknown[]) => ({ kind: 'and', conditions })),
    asc: vi.fn((value: unknown) => ({ kind: 'asc', value })),
    eq: vi.fn((column: unknown, value: unknown) => ({ kind: 'eq', column, value })),
    membershipPlans: helper.CANONICAL_MEMBERSHIP_PLAN_COLUMNS,
    subscriptions: { id: 'id' },
    db: {
      select: helper.createQueuedSelectMock(mocks.selectResults),
      query: {
        subscriptions: {
          findFirst: () => mocks.findSubscription(),
        },
        user: {
          findFirst: () => mocks.findUser(),
        },
        tenantSettings: {
          findFirst: () => mocks.findTenantSetting(),
        },
        membershipPlans: {
          findFirst: () => mocks.findMembershipPlan(),
        },
        referrals: {
          findFirst: () => mocks.findReferral(),
        },
      },
      insert: () => ({
        values: (vals: unknown) => {
          return mocks.insertValues(vals) as unknown as { onConflictDoUpdate: () => Promise<void> };
        },
      }),
    },
  };
});

vi.mock('@interdomestik/domain-referrals/member-referrals/rewards', () => ({
  createMemberReferralRewardCore: mocks.createMemberReferralReward,
}));

import { handleSubscriptionChanged } from '@interdomestik/domain-membership-billing/paddle-webhooks/handlers/subscriptions';

describe('handleSubscriptionChanged tenant guardrail', () => {
  beforeEach(() => {
    mocks.insertValues.mockClear();
    mocks.selectResults.length = 0;
    mocks.findSubscription.mockClear();
    mocks.findUser.mockClear();
    mocks.findTenantSetting.mockClear();
    mocks.findMembershipPlan.mockClear();
    mocks.findReferral.mockClear();
    mocks.createMemberReferralReward.mockClear();
  });

  it('does not write when tenant cannot be resolved (no defaults)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      handleSubscriptionChanged({
        eventType: 'subscription.created',
        data: {
          id: 'sub-1',
          status: 'active',
          items: [{ price: { id: 'price-1', unitPrice: { amount: '2000', currencyCode: 'EUR' } } }],
          customData: { userId: 'user-1' },
        },
      })
    ).rejects.toThrow('Unable to resolve subscription context for sub-1');

    expect(warn).toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('applies tenant default branch when agentId is missing', async () => {
    mocks.findUser.mockResolvedValueOnce({
      tenantId: 'tenant_mk',
      email: 'u@example.com',
      name: 'U',
      memberNumber: 'M-1',
    });
    mocks.findTenantSetting.mockResolvedValueOnce({ value: { branchId: 'branch-mk-bitola-main' } });

    await handleSubscriptionChanged({
      eventType: 'subscription.created',
      data: {
        id: 'sub-2',
        status: 'active',
        items: [{ price: { id: 'price-2', unitPrice: { amount: '2000', currencyCode: 'EUR' } } }],
        customData: { userId: 'user-2' },
      },
    });

    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    const inserted = mocks.insertValues.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(inserted?.tenantId).toBe('tenant_mk');
    expect(inserted?.branchId).toBe('branch-mk-bitola-main');
    expect(inserted?.agentId).toBeUndefined();
  });
});
