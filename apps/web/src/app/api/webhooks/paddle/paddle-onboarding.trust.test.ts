import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { getAuthBaseURL, getTrustedOrigins } from '@/lib/auth/utils';
import { resolveTenantEmailOrigins } from '@/lib/email-link-origins';
import type { TenantId } from '@/lib/tenant/tenant-host-aliases';
import { betterAuth } from 'better-auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTenantPasswordResetRedirectUrl } from './paddle-onboarding';

/**
 * Server-side `auth.api.requestPasswordReset` calls skip Better Auth's origin check, so a reset
 * link whose callback Better Auth does not trust is minted and mailed but fails when followed.
 * This pins, per deployment shape, that Better Auth built from the app's own auth configuration
 * issues the token from the origin the link resolver expects and trusts every callback the
 * resolver returns.
 */
const CLEARED = [
  'VERCEL',
  'VERCEL_URL',
  'VERCEL_ENV',
  'VERCEL_TARGET_ENV',
  'INTERDOMESTIK_DEPLOY_ENV',
  'INTERDOMESTIK_AUTOMATED',
  'PLAYWRIGHT',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_TRUSTED_ORIGINS',
  'NEXT_PUBLIC_APP_URL',
  'KS_HOST',
  'MK_HOST',
  'AL_HOST',
  'PILOT_HOST',
];

type Shape = Readonly<{ label: string; env: Record<string, string>; tenants: TenantId[] }>;

const SHAPES: Shape[] = [
  {
    label: 'a Vercel production deployment',
    env: {
      VERCEL: '1',
      VERCEL_ENV: 'production',
      BETTER_AUTH_URL: 'https://ida.interdomestik.com',
    },
    tenants: ['tenant_ks', 'tenant_mk'],
  },
  {
    label: 'the Vercel staging preview',
    env: {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      BETTER_AUTH_URL: 'https://staging.interdomestik.com',
    },
    tenants: ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk'],
  },
  {
    label: 'a local door lane',
    env: { PLAYWRIGHT: '1', BETTER_AUTH_URL: 'http://ida.localhost:3310' },
    tenants: ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk'],
  },
  {
    label: 'a local door with an extra trusted alias',
    env: {
      PLAYWRIGHT: '1',
      BETTER_AUTH_URL: 'http://ida.localhost:3310',
      KS_HOST: 'ks.127.0.0.1.nip.io:3310',
      BETTER_AUTH_TRUSTED_ORIGINS: 'http://ida.localhost:3310,http://ks.127.0.0.1.nip.io:3310',
    },
    tenants: ['tenant_ks'],
  },
];

function baseOrigin(baseURL: ReturnType<typeof getAuthBaseURL>): string {
  return new URL(typeof baseURL === 'string' ? baseURL : baseURL.fallback).origin;
}

describe('emailed reset links and the Better Auth configuration', () => {
  beforeEach(() => {
    for (const key of CLEARED) vi.stubEnv(key, '');
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(SHAPES)('agree on $label', async ({ env, tenants }) => {
    const origin = env.BETTER_AUTH_URL!;
    stubDeploymentOrigin(
      origin.startsWith('http:') ? 'local' : origin.includes('staging.') ? 'staging' : 'production',
      origin
    );
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const baseURL = getAuthBaseURL();
    const context = await betterAuth({
      baseURL,
      trustedOrigins: getTrustedOrigins(),
      secret: 'ida-acq2b2-trust-contract-secret-at-least-32-bytes',
    }).$context;

    for (const tenant of tenants) {
      expect(resolveTenantEmailOrigins(tenant).authOrigin).toBe(baseOrigin(baseURL));
      const redirectTo = buildTenantPasswordResetRedirectUrl(tenant);
      expect(context.isTrustedOrigin(redirectTo), redirectTo).toBe(true);
    }
  });

  it('keeps an untrusted alias outside the generated destination', async () => {
    stubDeploymentOrigin('local', 'http://ida.localhost:3310');
    vi.stubEnv('BETTER_AUTH_URL', 'http://ida.localhost:3310');
    vi.stubEnv('KS_HOST', 'ks.127.0.0.1.nip.io:3310');
    const context = await betterAuth({
      baseURL: getAuthBaseURL(),
      trustedOrigins: getTrustedOrigins(),
      secret: 'ida-acq2b2-trust-contract-secret-at-least-32-bytes',
    }).$context;

    expect(context.isTrustedOrigin(buildTenantPasswordResetRedirectUrl('tenant_ks'))).toBe(true);
    expect(context.isTrustedOrigin('http://ks.127.0.0.1.nip.io:3310/sq/reset-password')).toBe(
      false
    );
  });
});
