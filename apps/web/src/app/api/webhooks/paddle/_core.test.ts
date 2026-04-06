import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      requestPasswordReset: hoisted.requestPasswordReset,
    },
  },
}));

import { buildTenantPasswordResetRedirectUrl, requestPasswordResetOnboarding } from './_core';

describe('paddle webhook onboarding helpers', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalKsHost = process.env.KS_HOST;
  const originalMkHost = process.env.MK_HOST;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    mutableEnv.KS_HOST = originalKsHost;
    mutableEnv.MK_HOST = originalMkHost;
    mutableEnv.NODE_ENV = originalNodeEnv;
    mutableEnv.VERCEL_ENV = originalVercelEnv;
  });

  it('builds a tenant-specific reset password URL', () => {
    delete mutableEnv.MK_HOST;
    mutableEnv.NODE_ENV = 'development';
    delete mutableEnv.VERCEL_ENV;

    expect(buildTenantPasswordResetRedirectUrl('tenant_mk')).toBe(
      'http://mk.localhost/mk/reset-password'
    );
  });

  it('requests password reset onboarding with tenant-specific redirect', async () => {
    mutableEnv.KS_HOST = 'ks.example.test';

    await requestPasswordResetOnboarding({
      email: 'member@example.com',
      tenantId: 'tenant_ks',
    });

    expect(hoisted.requestPasswordReset).toHaveBeenCalledWith({
      body: {
        email: 'member@example.com',
        redirectTo: 'https://ks.example.test/sq/reset-password',
      },
    });
  });
});
