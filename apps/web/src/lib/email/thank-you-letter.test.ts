import { describe, expect, it } from 'vitest';
import { renderThankYouLetterEmail, type ThankYouLetterParams } from './thank-you-letter';

describe('renderThankYouLetterEmail web boundary', () => {
  const params: ThankYouLetterParams = {
    memberName: 'John Doe',
    memberNumber: 'M-12345678',
    planName: 'Standard annual',
    planPrice: 'EUR 20.00',
    planInterval: 'year',
    memberSince: 'December 22, 2025',
    expiresAt: 'December 22, 2026',
    providerReference: 'sub_123',
    dashboardUrl: 'https://ks.interdomestik.com/en/member/membership',
    locale: 'en',
  };

  it('keeps the tenant-localized membership URL supplied by the delivery boundary', () => {
    const result = renderThankYouLetterEmail(params);

    expect(result.subject).toBe('Membership confirmed');
    expect(result.html).toContain(params.dashboardUrl);
    expect(result.text).toContain(params.dashboardUrl);
    expect(result.html).not.toContain('localhost');
  });
});
