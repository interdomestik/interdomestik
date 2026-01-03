import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn((_vals?: unknown) => ({ onConflictDoUpdate: vi.fn(async () => undefined) })),
  findSubscription: vi.fn(async () => null) as any,
  findUser: vi.fn(async () => null) as any,
  findTenantSetting: vi.fn(async () => null) as any,
}));

vi.mock('@interdomestik/database', () => ({
  subscriptions: { id: 'id' },
  db: {
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
    },
    insert: () => ({
      values: (vals: unknown) => {
        return mocks.insertValues(vals) as unknown as { onConflictDoUpdate: () => Promise<void> };
      },
    }),
  },
}));

import { handleSubscriptionChanged } from '@interdomestik/domain-membership-billing/paddle-webhooks/handlers/subscriptions';

describe('handleSubscriptionChanged tenant guardrail', () => {
  beforeEach(() => {
    mocks.insertValues.mockClear();
    mocks.findSubscription.mockClear();
    mocks.findUser.mockClear();
    mocks.findTenantSetting.mockClear();
  });

  it('does not write when tenant cannot be resolved (no defaults)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await handleSubscriptionChanged({
      eventType: 'subscription.created',
      data: {
        id: 'sub-1',
        status: 'active',
        items: [{ price: { id: 'price-1', unitPrice: { amount: '2000', currencyCode: 'EUR' } } }],
        customData: { userId: 'user-1' },
      },
    });

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
