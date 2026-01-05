import { describe, expect, it, vi } from 'vitest';

import { cancelSubscription, getPaymentUpdateUrl } from './subscription';

vi.mock('./subscription/context', () => ({
  getActionContext: vi.fn(),
}));

vi.mock('./subscription/get-payment-update-url', () => ({
  getPaymentUpdateUrlCore: vi.fn(),
}));

vi.mock('./subscription/cancel', () => ({
  cancelSubscriptionCore: vi.fn(),
}));

describe('actions/subscription wrapper', () => {
  it('delegates to core modules with session from context', async () => {
    const { getActionContext } = await import('./subscription/context');
    const { getPaymentUpdateUrlCore } = await import('./subscription/get-payment-update-url');
    const { cancelSubscriptionCore } = await import('./subscription/cancel');

    (getActionContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      session: { user: { id: 'u1' } },
    });

    (getPaymentUpdateUrlCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      url: 'https://example.com/update',
      error: undefined,
    });

    (cancelSubscriptionCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      error: undefined,
    });

    const subId = 'sub_123';
    const paymentResult = await getPaymentUpdateUrl(subId);
    const cancelResult = await cancelSubscription(subId);

    expect(getPaymentUpdateUrlCore).toHaveBeenCalledWith({
      session: { user: { id: 'u1' } },
      subscriptionId: subId,
    });

    expect(cancelSubscriptionCore).toHaveBeenCalledTimes(1);
    expect(cancelSubscriptionCore).toHaveBeenCalledWith(
      {
        session: { user: { id: 'u1' } },
        subscriptionId: subId,
      },
      expect.anything()
    );

    expect(paymentResult).toEqual({ url: 'https://example.com/update', error: undefined });
    expect(cancelResult).toEqual({ success: true, error: undefined });
  });
});
