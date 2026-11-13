import { stubDeploymentOrigin } from '../../deployment-origin.test-support';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderClaimSubmittedEmail } from './claims';

afterEach(() => vi.unstubAllEnvs());

describe('claim email templates', () => {
  it('reads the deployment origin lazily at rendering time', () => {
    stubDeploymentOrigin();
    vi.stubEnv('IDA_HOST', 'staging.interdomestik.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://staging.interdomestik.com');
    vi.stubEnv('BETTER_AUTH_URL', 'https://staging.interdomestik.com/api/auth');
    const template = renderClaimSubmittedEmail({
      claimId: 'claim-1',
      claimTitle: 'Vehicle',
      category: 'Vehicle',
    });
    expect(template.text).toContain('https://staging.interdomestik.com/member/claims/claim-1');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.interdomestik.com');
    expect(() =>
      renderClaimSubmittedEmail({ claimId: 'claim-1', claimTitle: 'Vehicle', category: 'Vehicle' })
    ).toThrow();
  });
});
