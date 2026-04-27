import { afterEach, describe, expect, it, vi } from 'vitest';

describe('thank-you letter email template', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not fall back to localhost for production dashboard links', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.resetModules();

    const { renderThankYouLetterEmail } = await import('./thank-you-letter');

    const template = renderThankYouLetterEmail({
      memberName: 'Member One',
      memberNumber: 'MBR-1',
      planName: 'Family',
      planPrice: 'EUR 99',
      planInterval: 'year',
      memberSince: '2026-04-27',
      expiresAt: '2027-04-27',
    });

    expect(template.html).toContain('https://www.interdomestik.com/member');
    expect(template.html).not.toContain('localhost');
  });
});
