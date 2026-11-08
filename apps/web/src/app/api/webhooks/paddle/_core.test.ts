import { EmailLinkOriginError } from '@/lib/email-link-origins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './_core.fixture';
import { buildTenantPasswordResetRedirectUrl } from './_core';

const DEPLOYMENT_KEYS = ['VERCEL_ENV', 'VERCEL_TARGET_ENV', 'INTERDOMESTIK_DEPLOY_ENV'];
const HOST_KEYS = ['KS_HOST', 'MK_HOST', 'AL_HOST', 'PILOT_HOST', 'NEXT_PUBLIC_APP_URL'];

describe('paddle webhook onboarding helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of [...DEPLOYMENT_KEYS, ...HOST_KEYS]) vi.stubEnv(key, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a tenant reset URL on the issuing deployment outside production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:3310');

    expect(buildTenantPasswordResetRedirectUrl('tenant_mk')).toBe(
      'http://127.0.0.1:3310/mk/reset-password'
    );
  });

  it('builds the canonical tenant reset URL on a production deployment', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', 'https://www.interdomestik.com');

    expect(buildTenantPasswordResetRedirectUrl('tenant_ks')).toBe(
      'https://ks.interdomestik.com/sq/reset-password'
    );
  });

  it('rejects an unknown tenant instead of borrowing a default tenant host', () => {
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_al');
    vi.stubEnv('BETTER_AUTH_URL', 'http://127.0.0.1:3310');

    expect(() => buildTenantPasswordResetRedirectUrl('not-a-tenant')).toThrow(EmailLinkOriginError);
  });
});
