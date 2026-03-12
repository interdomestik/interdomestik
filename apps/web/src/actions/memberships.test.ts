import { describe, expect, it, vi } from 'vitest';

import { getCustomerPortalUrl, requestCancellation } from './memberships';

vi.mock('./subscription', () => ({
  cancelSubscription: vi.fn(),
  getPaymentUpdateUrl: vi.fn(),
}));

describe('actions/memberships', () => {
  it('delegates customer-portal requests to the canonical payment-update action', async () => {
    const { getPaymentUpdateUrl } = await import('./subscription');
    (getPaymentUpdateUrl as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: undefined,
      url: 'https://billing.interdomestik.com/portal',
    });

    await expect(getCustomerPortalUrl('sub_123')).resolves.toEqual({
      error: undefined,
      url: 'https://billing.interdomestik.com/portal',
    });

    expect(getPaymentUpdateUrl).toHaveBeenCalledWith('sub_123');
  });

  it('delegates cancellation requests to the canonical subscription action', async () => {
    const { cancelSubscription } = await import('./subscription');
    (cancelSubscription as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      cancellationTerms: {
        coolingOffAppliesSeparately: true,
        currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
        effectiveFrom: 'next_billing_period',
        hasAcceptedEscalation: false,
        refundStatus: 'eligible',
        refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
      },
      error: undefined,
      success: true,
    });

    await expect(requestCancellation('sub_123')).resolves.toEqual({
      cancellationTerms: {
        coolingOffAppliesSeparately: true,
        currentPeriodEndsAt: '2027-03-01T00:00:00.000Z',
        effectiveFrom: 'next_billing_period',
        hasAcceptedEscalation: false,
        refundStatus: 'eligible',
        refundWindowEndsAt: '2026-03-31T00:00:00.000Z',
      },
      error: undefined,
      success: true,
    });

    expect(cancelSubscription).toHaveBeenCalledWith('sub_123');
  });
});
