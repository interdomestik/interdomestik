import { EmailLinkOriginError } from '@/lib/email-link-origins';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPasswordResetOnboarding } from './paddle-onboarding';

const hoisted = vi.hoisted(() => ({ requestPasswordReset: vi.fn() }));

vi.mock('@/lib/auth', () => ({
  auth: { api: { requestPasswordReset: hoisted.requestPasswordReset } },
}));

const STAGING = 'https://staging.example.test';

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
    for (const key of ['VERCEL_TARGET_ENV', 'INTERDOMESTIK_DEPLOY_ENV', 'NEXT_PUBLIC_APP_URL']) {
      vi.stubEnv(key, '');
    }
    for (const key of ['KS_HOST', 'MK_HOST', 'AL_HOST', 'PILOT_HOST']) vi.stubEnv(key, '');
    vi.stubEnv('VERCEL_ENV', 'preview');
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
    await expectRefused('missing_auth_origin');
  });

  it('refuses a preview configured with a production origin', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://www.interdomestik.com');
    await expectRefused('production_origin_outside_production');
  });
});
