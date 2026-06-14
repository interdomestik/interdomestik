import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findSubscriptionFirst: vi.fn(),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  subscriptions: {
    id: 'subscriptions.id',
    providerSubscriptionId: 'subscriptions.provider_subscription_id',
    tenantId: 'subscriptions.tenant_id',
  },
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.and,
  db: { query: { subscriptions: { findFirst: hoisted.findSubscriptionFirst } } },
  eq: hoisted.eq,
  or: hoisted.or,
  subscriptions: hoisted.subscriptions,
}));

import { findSubscriptionByProviderReference } from './subscription';

type FindFirstArgs = {
  where?: (subs: typeof hoisted.subscriptions, operators: typeof hoisted) => unknown;
};

describe('findSubscriptionByProviderReference tenant scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can constrain provider-reference lookup by tenant for race recovery', async () => {
    hoisted.findSubscriptionFirst.mockImplementationOnce(async (args: FindFirstArgs) => {
      const whereNode = args.where?.(hoisted.subscriptions, hoisted);
      expect(whereNode).toEqual({
        op: 'and',
        args: [
          { op: 'eq', left: 'subscriptions.tenant_id', right: 'tenant_abc' },
          {
            op: 'or',
            args: [
              { op: 'eq', left: 'subscriptions.id', right: 'sub_provider_123' },
              {
                op: 'eq',
                left: 'subscriptions.provider_subscription_id',
                right: 'sub_provider_123',
              },
            ],
          },
        ],
      });
      return { id: 'sub_internal_1', tenantId: 'tenant_abc' };
    });

    await expect(
      findSubscriptionByProviderReference('sub_provider_123', { tenantId: 'tenant_abc' })
    ).resolves.toEqual({ id: 'sub_internal_1', tenantId: 'tenant_abc' });
  });

  it('keeps the payment-provider fallback lookup unscoped when tenant is unknown', async () => {
    hoisted.findSubscriptionFirst.mockImplementationOnce(async (args: FindFirstArgs) => {
      const whereNode = args.where?.(hoisted.subscriptions, hoisted);
      expect(whereNode).toEqual({
        op: 'or',
        args: [
          { op: 'eq', left: 'subscriptions.id', right: 'sub_provider_123' },
          {
            op: 'eq',
            left: 'subscriptions.provider_subscription_id',
            right: 'sub_provider_123',
          },
        ],
      });
      return { id: 'sub_internal_1', tenantId: 'tenant_abc' };
    });

    await expect(findSubscriptionByProviderReference('sub_provider_123')).resolves.toEqual({
      id: 'sub_internal_1',
      tenantId: 'tenant_abc',
    });
  });
});
