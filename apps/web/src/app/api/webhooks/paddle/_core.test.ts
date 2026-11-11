import { EmailLinkOriginError } from '@/lib/email-link-origins';
import { stubDeploymentOrigin, PRODUCTION_DOOR } from '@/lib/deployment-origin.test-support';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './_core.fixture';
import { buildTenantPasswordResetRedirectUrl } from './_core';

describe('paddle webhook onboarding helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDeploymentOrigin('local', 'http://127.0.0.1:3310');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds a tenant reset URL on the issuing deployment outside production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(buildTenantPasswordResetRedirectUrl('tenant_mk')).toBe(
      'http://127.0.0.1:3310/mk/reset-password'
    );
  });

  it('builds the canonical tenant reset URL on a production deployment', () => {
    stubDeploymentOrigin('production', PRODUCTION_DOOR);

    expect(buildTenantPasswordResetRedirectUrl('tenant_ks')).toBe(
      `${PRODUCTION_DOOR}/sq/reset-password`
    );
  });

  it('rejects an unknown tenant instead of borrowing a default tenant host', () => {
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_al');

    expect(() => buildTenantPasswordResetRedirectUrl('not-a-tenant')).toThrow(EmailLinkOriginError);
  });
});
