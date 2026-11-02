import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  authorizePaddleTenant: vi.fn(),
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
    resolvePaddleSubscriptionOwner: hoisted.resolvePaddleSubscriptionOwner,
    authorizePaddleTenant: hoisted.authorizePaddleTenant,
  };
});

import { withTenantContext } from '@interdomestik/database';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  PaddleSubscriptionReferenceAmbiguousError,
  isPaddleSubscriptionReferenceAmbiguousError,
  isRetryablePaddleWebhookError,
} from './paddle-webhooks/errors';
import * as persistExports from './paddle-webhooks/persist';
import {
  TEST_PADDLE_DELIVERY,
  authorizeTestPaddleOwner,
} from './paddle-webhooks/paddle-authority.test-support';
import { findPaddleSubscriptionByReference, findPaddleSubscriptionInTenant } from './subscription';

type FindFirstArgs = {
  where?: (subs: typeof hoisted.subscriptions, operators: typeof hoisted) => unknown;
};

describe('findPaddleSubscriptionByReference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.authorizePaddleTenant.mockImplementation(authorizeTestPaddleOwner);
  });

  it('reads the resolved subscription under the authority minted from the exact owner object', async () => {
    const owner = { subscriptionId: 'sub_internal_1', tenantId: 'tenant_abc' };
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce(owner);
    hoisted.findSubscriptionFirst.mockImplementationOnce(async (args: FindFirstArgs) => {
      const whereNode = args.where?.(hoisted.subscriptions, hoisted);
      // The read is bound to the authority's tenant and the resolved row id, never the raw reference.
      expect(whereNode).toEqual({
        op: 'and',
        args: [
          { op: 'eq', left: 'subscriptions.tenant_id', right: 'tenant_abc' },
          { op: 'eq', left: 'subscriptions.id', right: 'sub_internal_1' },
        ],
      });
      return { id: 'sub_internal_1', tenantId: 'tenant_abc' };
    });

    const lookup = await findPaddleSubscriptionByReference(
      '  sub_provider_123 ',
      TEST_PADDLE_DELIVERY
    );

    expect(hoisted.resolvePaddleSubscriptionOwner).toHaveBeenCalledWith('sub_provider_123');
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledTimes(1);
    expect(hoisted.authorizePaddleTenant).toHaveBeenCalledWith(TEST_PADDLE_DELIVERY, owner);
    expect(hoisted.authorizePaddleTenant.mock.calls[0]![1]).toBe(owner);
    const authority = hoisted.authorizePaddleTenant.mock.results[0]!.value;
    expect(lookup).toEqual({
      subscription: { id: 'sub_internal_1', tenantId: 'tenant_abc' },
      authority,
    });
    expect(lookup?.authority).toBe(authority);
    expect(withTenantContext).toHaveBeenCalledTimes(1);
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
  });

  it('returns null without minting an authority when no owner exists', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce(null);

    await expect(
      findPaddleSubscriptionByReference('sub_provider_123', TEST_PADDLE_DELIVERY)
    ).resolves.toBeNull();
    await expect(
      findPaddleSubscriptionByReference('   ', TEST_PADDLE_DELIVERY)
    ).resolves.toBeNull();

    expect(hoisted.authorizePaddleTenant).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('throws the terminal ambiguity error without minting an authority', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce('ambiguous');

    await expect(
      findPaddleSubscriptionByReference('sub_provider_123', TEST_PADDLE_DELIVERY)
    ).rejects.toBeInstanceOf(PaddleSubscriptionReferenceAmbiguousError);

    expect(hoisted.authorizePaddleTenant).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('fails closed when the owner is refused', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce({
      subscriptionId: 'sub_internal_1',
      tenantId: 'tenant_abc',
    });
    hoisted.authorizePaddleTenant.mockImplementationOnce(() => {
      throw new Error('Paddle tenant authority requires a resolver-produced owner');
    });

    await expect(
      findPaddleSubscriptionByReference('sub_provider_123', TEST_PADDLE_DELIVERY)
    ).rejects.toThrow('resolver-produced owner');

    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('fails closed when the stored row names another tenant than the authority', async () => {
    hoisted.resolvePaddleSubscriptionOwner.mockResolvedValueOnce({
      subscriptionId: 'sub_internal_1',
      tenantId: 'tenant_abc',
    });
    hoisted.findSubscriptionFirst.mockResolvedValueOnce({
      id: 'sub_internal_1',
      tenantId: 'tenant_other',
    });

    await expect(
      findPaddleSubscriptionByReference('sub_provider_123', TEST_PADDLE_DELIVERY)
    ).rejects.toThrow('tenant conflict: record=tenant_other authority=tenant_abc');
  });
});

describe('findPaddleSubscriptionInTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constrains the provider-reference lookup to the authority tenant and never resolves an owner', async () => {
    const authority = mintTestTenantAuthority('tenant_abc');
    hoisted.findSubscriptionFirst.mockImplementationOnce(async (args: FindFirstArgs) => {
      expect(args.where?.(hoisted.subscriptions, hoisted)).toEqual({
        op: 'and',
        args: [
          {
            op: 'eq',
            left: 'subscriptions.tenant_id',
            right: readTenantAuthority(authority).tenantId,
          },
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

    await expect(findPaddleSubscriptionInTenant(' sub_provider_123 ', authority)).resolves.toEqual({
      id: 'sub_internal_1',
      tenantId: 'tenant_abc',
    });

    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(hoisted.resolvePaddleSubscriptionOwner).not.toHaveBeenCalled();
  });

  it('returns null without a tenant context for a blank reference', async () => {
    await expect(
      findPaddleSubscriptionInTenant('  ', mintTestTenantAuthority('tenant_abc'))
    ).resolves.toBeNull();
    expect(withTenantContext).not.toHaveBeenCalled();
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
