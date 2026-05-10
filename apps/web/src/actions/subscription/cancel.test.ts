import { describe, expect, it, vi } from 'vitest';

import { cancelSubscriptionCore } from './cancel';

const mockRunCommercialActionWithIdempotency = vi.hoisted(() => vi.fn());

vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: (...args: unknown[]) =>
    mockRunCommercialActionWithIdempotency(...args),
}));

describe('actions/subscription cancelSubscriptionCore', () => {
  it('returns Unauthorized when session is missing', async () => {
    vi.clearAllMocks();

    const result = await cancelSubscriptionCore({
      idempotencyKey: 'cancel-unauthorized',
      session: null,
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

    const result = await cancelSubscriptionCore({
      idempotencyKey: 'cancel-1',
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
          tenantId: 'tenant-1',
        },
        idempotencyKey: 'cancel-1',
      })
    );
  });
});
