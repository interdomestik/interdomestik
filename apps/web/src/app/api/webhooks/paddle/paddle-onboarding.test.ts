import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { EmailLinkOriginError } from '@/lib/email-link-origins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPasswordResetOnboarding } from './paddle-onboarding';

const hoisted = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  auth: { api: { requestPasswordReset: hoisted.requestPasswordReset } },
}));

const STAGING = 'https://staging.interdomestik.com';

async function expectRefused(reason: string, tenantId = 'tenant_ks'): Promise<void> {
  const failure = await requestPasswordResetOnboarding({
    email: 'member@example.com',
    tenantId,
  }).catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(EmailLinkOriginError);
  expect((failure as EmailLinkOriginError).reason).toBe(reason);
  // No token is minted and no email is sent for a link that would leave this deployment.
  expect(hoisted.requestPasswordReset).not.toHaveBeenCalled();
}

describe('requestPasswordResetOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDeploymentOrigin();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_URL', STAGING);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps a preview reset link on the preview deployment', async () => {
    await requestPasswordResetOnboarding({ email: 'member@example.com', tenantId: 'tenant_ks' });

    expect(hoisted.requestPasswordReset).toHaveBeenCalledWith({
      body: { email: 'member@example.com', redirectTo: `${STAGING}/sq/reset-password` },
    });
  });

  it('refuses an unknown tenant', async () => {
    await expectRefused('unknown_tenant', 'not-a-tenant');
  });

  it('refuses a preview without its own auth origin', async () => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    await expectRefused('invalid_deployment_origin');
  });

  it('refuses a preview configured with a production origin', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://www.interdomestik.com');
    await expectRefused('invalid_deployment_origin');
  });
});
