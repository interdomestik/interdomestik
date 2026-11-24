import { afterEach, describe, expect, it } from 'vitest';

import { evaluateEmailSignUpTenantGuard, isEmailSignUpUrl } from './sign-up-tenant-guard';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_IDA_HOST = process.env.IDA_HOST;
const MUTABLE_ENV = process.env as Record<string, string | undefined>;

function setProductionBuildEnv(idaHost?: string) {
  MUTABLE_ENV.NODE_ENV = 'production';
  MUTABLE_ENV.IDA_HOST = idaHost;
}

afterEach(() => {
  MUTABLE_ENV.NODE_ENV = ORIGINAL_NODE_ENV;
  MUTABLE_ENV.IDA_HOST = ORIGINAL_IDA_HOST;
});

describe('isEmailSignUpUrl', () => {
  it('matches email signup route only', () => {
    expect(isEmailSignUpUrl('https://ida.localhost:3000/api/auth/sign-up/email')).toBe(true);
    expect(isEmailSignUpUrl('https://ida.localhost:3000/api/auth/sign-in/email')).toBe(false);
  });
});

describe('evaluateEmailSignUpTenantGuard', () => {
  const url = 'https://ida.localhost:3000/api/auth/sign-up/email';
  const onboarding = (tenant: string, mode: 'resolved' | 'deferred' = 'resolved') => ({
    onboarding: { tenant, mode },
  });

  it('allows signup when country host and payload tenant match', () => {
    const result = evaluateEmailSignUpTenantGuard({
      admissionTenant: 'tenant_ks',
      url,
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: onboarding('tenant_ks'),
    });

    expect(result).toEqual({ decision: 'allow' });
  });

  it('denies signup when country host and payload tenant mismatch', () => {
    const result = evaluateEmailSignUpTenantGuard({
      admissionTenant: 'tenant_ks',
      url,
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: onboarding('tenant_mk'),
    });

    expect(result).toEqual({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'tenant_mismatch',
      resolvedTenantId: 'tenant_ks',
    });
  });

  it('allows the admission tenant on the IDA front door', () => {
    setProductionBuildEnv();

    const result = evaluateEmailSignUpTenantGuard({
      admissionTenant: 'tenant_mk',
      url,
      headers: new Headers({ host: 'ida.localhost:3000' }),
      body: onboarding('tenant_mk', 'deferred'),
    });

    expect(result).toEqual({ decision: 'allow' });
  });

  it('denies a well-formed deferred selector for a different admission tenant', () => {
    expect(
      evaluateEmailSignUpTenantGuard({
        admissionTenant: 'tenant_ks',
        url,
        headers: new Headers({ host: 'ida.localhost:3000' }),
        body: onboarding('tenant_mk', 'deferred'),
      })
    ).toMatchObject({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      reason: 'tenant_mismatch',
      resolvedTenantId: 'tenant_ks',
    });
  });

  it('denies front-door signup when forwarded host conflicts', () => {
    setProductionBuildEnv();

    const result = evaluateEmailSignUpTenantGuard({
      admissionTenant: 'tenant_ks',
      url,
      headers: new Headers({
        host: 'ida.localhost:3000',
        'x-forwarded-host': 'ks.localhost:3000',
      }),
      body: onboarding('tenant_mk', 'deferred'),
    });

    expect(result).toEqual({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'missing_tenant_context',
      resolvedTenantId: null,
    });
  });

  it('denies missing or malformed tenant payloads', () => {
    const missing = evaluateEmailSignUpTenantGuard({
      admissionTenant: 'tenant_ks',
      url,
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: {},
    });
    const malformed = evaluateEmailSignUpTenantGuard({
      admissionTenant: 'tenant_ks',
      url,
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: onboarding('not-a-tenant'),
    });

    expect(missing?.decision).toBe('deny');
    expect(malformed?.decision).toBe('deny');
  });

  it('enforces host-owned mode and accepts the deferred social selector shape', () => {
    expect(
      evaluateEmailSignUpTenantGuard({
        admissionTenant: 'tenant_ks',
        url,
        headers: new Headers({ host: 'ks.localhost:3000' }),
        body: onboarding('tenant_ks', 'deferred'),
      })?.decision
    ).toBe('deny');
    expect(
      evaluateEmailSignUpTenantGuard({
        admissionTenant: 'tenant_ks',
        url,
        headers: new Headers({ host: 'ida.localhost:3000' }),
        body: onboarding('tenant_ks', 'resolved'),
      })?.decision
    ).toBe('deny');
    expect(
      evaluateEmailSignUpTenantGuard({
        admissionTenant: 'tenant_ks',
        url,
        headers: new Headers({ host: 'ida.localhost:3000' }),
        body: { additionalData: onboarding('tenant_ks', 'deferred') },
      })
    ).toEqual({ decision: 'allow' });
  });
});
