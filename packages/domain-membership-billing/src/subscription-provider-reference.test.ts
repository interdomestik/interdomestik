import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  findSubscriptionFirst: vi.fn(),
  resolvePaddleSubscriptionOwner: vi.fn(),
  or: vi.fn((...args: unknown[]) => ({ op: 'or', args })),
  subscriptions: {
    id: 'subscriptions.id',
    providerSubscriptionId: 'subscriptions.provider_subscription_id',
    tenantId: 'subscriptions.tenant_id',
  },
}));

vi.mock('@interdomestik/database', () => {
  const db = { query: { subscriptions: { findFirst: hoisted.findSubscriptionFirst } } };
  return {
    and: hoisted.and,
    db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(db)),
    eq: hoisted.eq,
    or: hoisted.or,
    subscriptions: hoisted.subscriptions,
  };
});

vi.mock('@interdomestik/database/paddle-provider-resolution', () => ({
  resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
}));

import { withTenantContext } from '@interdomestik/database';
import {
  PaddleSubscriptionReferenceAmbiguousError,
  isPaddleSubscriptionReferenceAmbiguousError,
  isRetryablePaddleWebhookError,
} from './paddle-webhooks/errors';
import * as persistExports from './paddle-webhooks/persist';
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
    expect(withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_abc' },
      expect.any(Function)
    );
  });

  it('resolves the payment-provider fallback through the privileged owner lookup when tenant is unknown', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce({
      subscriptionId: 'sub_internal_1',
      tenantId: 'tenant_abc',
    });
    hoisted.findSubscriptionFirst.mockImplementationOnce(async (args: FindFirstArgs) => {
      const whereNode = args.where?.(hoisted.subscriptions, hoisted);
      // The read is bound to the resolved tenant and the resolved row id, never the raw reference.
      expect(whereNode).toEqual({
        op: 'and',
        args: [
          { op: 'eq', left: 'subscriptions.tenant_id', right: 'tenant_abc' },
          { op: 'eq', left: 'subscriptions.id', right: 'sub_internal_1' },
        ],
      });
      return { id: 'sub_internal_1', tenantId: 'tenant_abc' };
    });

    await expect(findSubscriptionByProviderReference('sub_provider_123')).resolves.toEqual({
      id: 'sub_internal_1',
      tenantId: 'tenant_abc',
    });
    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_provider_123');
    expect(withTenantContext).toHaveBeenCalledTimes(1);
    expect(withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_abc' },
      expect.any(Function)
    );
  });

  it('returns null without a tenant context when the owner lookup finds nothing', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce(null);

    await expect(findSubscriptionByProviderReference('sub_provider_123')).resolves.toBeNull();

    expect(withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.findSubscriptionFirst).not.toHaveBeenCalled();
  });

  it('throws the terminal ambiguity error and never reads under a tenant when the owner is ambiguous', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce('ambiguous');

    const failure = await findSubscriptionByProviderReference('  sub_provider_123  ').catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(PaddleSubscriptionReferenceAmbiguousError);
    expect(isPaddleSubscriptionReferenceAmbiguousError(failure)).toBe(true);
    expect((failure as Error).message).toContain('sub_provider_123');
    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_provider_123');
    expect(withTenantContext).not.toHaveBeenCalled();
    expect(hoisted.findSubscriptionFirst).not.toHaveBeenCalled();
  });

  it('does not use the privileged owner lookup when the caller supplies the tenant', async () => {
    hoisted.findSubscriptionFirst.mockResolvedValueOnce({ id: 'sub_internal_1' });

    await findSubscriptionByProviderReference('sub_provider_123', { tenantId: 'tenant_abc' });

    expect(hoisted.resolvePaddleSubscriptionOwner).not.toHaveBeenCalled();
  });
});

describe('PaddleSubscriptionReferenceAmbiguousError', () => {
  it('is a non-retryable terminal error with a type guard that rejects other errors', () => {
    const error = new PaddleSubscriptionReferenceAmbiguousError('sub_x');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PaddleSubscriptionReferenceAmbiguousError');
    expect(isRetryablePaddleWebhookError(error)).toBe(false);
    expect(isPaddleSubscriptionReferenceAmbiguousError(error)).toBe(true);
    expect(isPaddleSubscriptionReferenceAmbiguousError(new Error('x'))).toBe(false);
    expect(isPaddleSubscriptionReferenceAmbiguousError(null)).toBe(false);
  });

  it('is re-exported from the persist entry point with the same identity', () => {
    expect(persistExports.PaddleSubscriptionReferenceAmbiguousError).toBe(
      PaddleSubscriptionReferenceAmbiguousError
    );
    expect(persistExports.isPaddleSubscriptionReferenceAmbiguousError).toBe(
      isPaddleSubscriptionReferenceAmbiguousError
    );
  });
});
