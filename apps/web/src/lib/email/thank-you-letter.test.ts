import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAGING_DOOR, stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { renderThankYouLetterEmail, type ThankYouLetterParams } from './thank-you-letter';

beforeEach(() => stubDeploymentOrigin());
afterEach(() => vi.unstubAllEnvs());

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
    dashboardUrl: `${STAGING_DOOR}/en/member/membership`,
    locale: 'en',
  };

  it('keeps the localized membership URL on the validated door supplied by the delivery boundary', () => {
    const result = renderThankYouLetterEmail(params);

    expect(result.subject).toBe('Membership confirmed');
    expect(result.html).toContain(params.dashboardUrl);
    expect(result.text).toContain(params.dashboardUrl);
    expect(result.html).not.toContain('localhost');
  });
});
