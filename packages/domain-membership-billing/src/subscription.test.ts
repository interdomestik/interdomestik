import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  findSubscriptionFirst: vi.fn(),
  resolvePaddleSubscriptionOwner: vi.fn(),
  withTenantContext: vi.fn(
    async (_context: { tenantId: string; role?: string }, action: (tx: unknown) => unknown) =>
      action({
        query: {
          subscriptions: {
            findFirst: hoisted.findSubscriptionFirst,
          },
        },
      })
  ),
  subscriptions: {
    userId: 'subscriptions.user_id',
    tenantId: 'subscriptions.tenant_id',
    id: 'subscriptions.id',
    providerSubscriptionId: 'subscriptions.provider_subscription_id',
  },
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: {
    query: {
      subscriptions: {
        findFirst: hoisted.findSubscriptionFirst,
      },
    },
  },
  eq: hoisted.eq,
  or: hoisted.or,
  subscriptions: hoisted.subscriptions,
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/database/paddle-provider-resolution', () => ({
  resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
}));

import {
  findSubscriptionByProviderReference,
  getActiveSubscription,
  hasActiveMembership,
  resolveProviderSubscriptionHandle,
} from './subscription';

describe('subscription claim eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findSubscriptionFirst.mockResolvedValue(null);
  });

  it('treats trialing subscriptions as active membership', async () => {
    const subscription = {
      id: 'sub_trialing',
      status: 'trialing',
      tenantId: 'tenant_ks',
      userId: 'member-1',
      gracePeriodEndsAt: null,
    };

    hoisted.findSubscriptionFirst.mockResolvedValue(subscription);

    await expect(hasActiveMembership('member-1', 'tenant_ks')).resolves.toBe(true);
    await expect(getActiveSubscription('member-1', 'tenant_ks')).resolves.toEqual(subscription);
  });

  it('treats past_due subscriptions inside grace as active membership', async () => {
    const subscription = {
      id: 'sub_grace',
      status: 'past_due',
      tenantId: 'tenant_ks',
      userId: 'member-1',
      gracePeriodEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };

    hoisted.findSubscriptionFirst.mockResolvedValue(subscription);

    await expect(hasActiveMembership('member-1', 'tenant_ks')).resolves.toBe(true);
    await expect(getActiveSubscription('member-1', 'tenant_ks')).resolves.toEqual(subscription);
  });

  it('treats scheduled cancellation as active membership until the provider closes the term', async () => {
    const subscription = {
      id: 'sub_scheduled_cancel',
      status: 'active',
      tenantId: 'tenant_ks',
      userId: 'member-1',
      cancelAtPeriodEnd: true,
      gracePeriodEndsAt: null,
    };

    hoisted.findSubscriptionFirst.mockResolvedValue(subscription);

    await expect(hasActiveMembership('member-1', 'tenant_ks')).resolves.toBe(true);
    await expect(getActiveSubscription('member-1', 'tenant_ks')).resolves.toEqual(subscription);
  });

  it('rejects past_due subscriptions after grace expires', async () => {
    hoisted.findSubscriptionFirst.mockResolvedValue({
      id: 'sub_expired',
      status: 'past_due',
      tenantId: 'tenant_ks',
      userId: 'member-1',
      gracePeriodEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await expect(hasActiveMembership('member-1', 'tenant_ks')).resolves.toBe(false);
    await expect(getActiveSubscription('member-1', 'tenant_ks')).resolves.toBeNull();
  });

  it('throws when tenantId is missing', async () => {
    await expect(hasActiveMembership('member-1', null)).rejects.toThrow(
      'tenantId is required for membership lookup'
    );
    await expect(getActiveSubscription('member-1', '')).rejects.toThrow(
      'tenantId is required for membership lookup'
    );
  });

  it('resolves a provider reference to its owning tenant, then reads the resolved subscription', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce({
      subscriptionId: 'sub_internal_1',
      tenantId: 'tenant_ks',
    });
    hoisted.findSubscriptionFirst.mockImplementationOnce(
      async (args: {
        where?: (
          subs: Record<string, string>,
          operators: {
            and: (...clauses: unknown[]) => unknown;
            eq: (left: unknown, right: unknown) => unknown;
          }
        ) => unknown;
      }) => {
        expect(
          args.where?.({ id: 'subscriptions.id', tenantId: 'subscriptions.tenant_id' }, hoisted)
        ).toEqual({
          op: 'and',
          args: [
            { op: 'eq', left: 'subscriptions.tenant_id', right: 'tenant_ks' },
            { op: 'eq', left: 'subscriptions.id', right: 'sub_internal_1' },
          ],
        });

        return { id: 'sub_internal_1', providerSubscriptionId: 'sub_provider_123' };
      }
    );

    await expect(findSubscriptionByProviderReference('sub_provider_123')).resolves.toEqual({
      id: 'sub_internal_1',
      providerSubscriptionId: 'sub_provider_123',
    });
    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_provider_123');
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_ks' },
      expect.any(Function)
    );
  });

  it('returns null without any tenant context when the provider reference has no unique owner', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce(null);

    await expect(findSubscriptionByProviderReference('sub_unknown')).resolves.toBeNull();

    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_unknown');
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.findSubscriptionFirst).not.toHaveBeenCalled();
  });

  it('prefers provider subscription id when calling the billing provider', () => {
    expect(
      resolveProviderSubscriptionHandle({
        id: 'sub_internal_1',
        providerSubscriptionId: 'sub_provider_123',
      })
    ).toBe('sub_provider_123');

    expect(
      resolveProviderSubscriptionHandle({
        id: 'sub_provider_123',
        providerSubscriptionId: null,
      })
    ).toBe('sub_provider_123');
  });
});
