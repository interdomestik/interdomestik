import { afterEach, describe, expect, it, vi } from 'vitest';

describe('claim email templates', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses NEXT_PUBLIC_APP_URL for claim detail links', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.interdomestik.com');
    vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000');
    vi.resetModules();

    const { renderClaimSubmittedEmail } = await import('./claims');

    const template = renderClaimSubmittedEmail({
      claimId: 'claim-1',
      claimTitle: 'Vehicle claim',
      category: 'Vehicle',
    });

    expect(template.text).toContain(
      'View claim: https://www.interdomestik.com/member/claims/claim-1'
    );
    expect(template.html).toContain('href="https://www.interdomestik.com/member/claims/claim-1"');
    expect(template.text).not.toContain('localhost');
    expect(template.html).not.toContain('localhost');
  });
});
