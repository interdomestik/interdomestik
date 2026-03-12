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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
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
      cancellationTerms: {
        coolingOffAppliesSeparately: true,
        currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
        effectiveFrom: 'next_billing_period',
        hasAcceptedEscalation: false,
        refundStatus: 'eligible',
        refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
      },
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
    expect(cancelResult).toEqual({
      cancellationTerms: {
        coolingOffAppliesSeparately: true,
        currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
        effectiveFrom: 'next_billing_period',
        hasAcceptedEscalation: false,
        refundStatus: 'eligible',
        refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
      },
      success: true,
      error: undefined,
    });
  });
});
