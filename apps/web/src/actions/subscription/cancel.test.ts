import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelSubscriptionCore } from './cancel';

const mockRunCommercialActionWithIdempotency = vi.hoisted(() => vi.fn());
const closure = vi.hoisted(() => ({ keepParkedPath: false }));

vi.mock('@interdomestik/domain-membership-billing/paddle-closed', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@interdomestik/domain-membership-billing/paddle-closed')>();
  return {
    ...actual,
    get PADDLE_CLOSED() {
      return closure.keepParkedPath ? false : actual.PADDLE_CLOSED;
    },
  };
});

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `membership.${key}`),
}));

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

describe('actions/subscription cancelSubscriptionCore while Paddle is closed', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    { key: 'fresh-cancellation', storedResult: undefined },
    { key: 'completed-cancellation', storedResult: { success: true } },
  ])('refuses before lookup, reservation, or replay for $key', async ({ key, storedResult }) => {
    mockRunCommercialActionWithIdempotency.mockResolvedValue(storedResult);

    const result = await cancelSubscriptionCore({
      idempotencyKey: key,
      authority: mintTestTenantAuthority('tenant-1'),
      session: { user: { id: 'member-1', tenantId: 'tenant-1' } },
      subscriptionId: 'sub_123',
    });

    expect(result).toEqual({ success: false, code: 'CLOSED', error: 'membership.CLOSED' });
    expect(mockRunCommercialActionWithIdempotency).not.toHaveBeenCalled();
  });
});

describe('parked cancelSubscriptionCore behaviour', () => {
  beforeEach(() => {
    closure.keepParkedPath = true;
  });

  afterEach(() => {
    closure.keepParkedPath = false;
  });
  it('returns Unauthorized when session is missing', async () => {
    vi.clearAllMocks();

    const result = await cancelSubscriptionCore({
      idempotencyKey: 'cancel-unauthorized',
      session: null,
      authority: null,
      subscriptionId: 'sub_123',
    });

    expect(result).toEqual({ error: 'Unauthorized', success: undefined });
    expect(mockRunCommercialActionWithIdempotency).not.toHaveBeenCalled();
  });

  it('passes tenant and actor scope to subscription cancellation idempotency', async () => {
    vi.clearAllMocks();
    mockRunCommercialActionWithIdempotency.mockResolvedValueOnce({
      success: true,
      error: undefined,
    });

    const authority = mintTestTenantAuthority('tenant-1');
    const result = await cancelSubscriptionCore({
      idempotencyKey: 'cancel-1',
      authority,
      session: {
        user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
      subscriptionId: 'sub_123',
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mockRunCommercialActionWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.cancel',
        scope: {
          kind: 'tenant',
          actorUserId: 'member-1',
          authority,
        },
        idempotencyKey: 'cancel-1',
      })
    );
  });
});
