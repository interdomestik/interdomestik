import { afterEach, describe, expect, it } from 'vitest';

import { evaluateEmailSignInTenantGuard, resolveTenantIdForEmailSignIn } from './_core';

const ORIGINAL_CUTOVER_FLAG = process.env.FEATURE_IDA_LIVE_LOGIN_CUTOVER;
const MUTABLE_ENV = process.env as Record<string, string | undefined>;

function restoreCutoverFlag(): void {
  MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = ORIGINAL_CUTOVER_FLAG;
}

afterEach(() => {
  restoreCutoverFlag();
});

describe('auth core ida live-login cutover', () => {
  it.each([
    ['ks.localhost:3000'],
    ['mk.localhost:3000'],
    ['al.localhost:3000'],
    ['pilot.localhost:3000'],
  ])('fails closed for country-host sign-in on %s', host => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    expect(
      resolveTenantIdForEmailSignIn(
        new Headers({ host, cookie: 'tenantId=tenant_mk', 'x-tenant-id': 'tenant_mk' })
      )
    ).toBeNull();
  });

  it('keeps country-host sign-in tenant resolution when flag is off', () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'false';

    expect(resolveTenantIdForEmailSignIn(new Headers({ host: 'ks.localhost:3000' }))).toBe(
      'tenant_ks'
    );
  });

  it('uses a validated IDA front-door sign-in hint over stale tenant cookies', () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    expect(
      resolveTenantIdForEmailSignIn(
        new Headers({
          host: 'ida.localhost:3000',
          cookie: 'tenantId=tenant_ks; better-auth.session_token=stale',
        }),
        { additionalData: { tenantId: 'tenant_mk' } }
      )
    ).toBe('tenant_mk');
  });

  it('fails closed on invalid IDA front-door sign-in hints even with stale cookies', () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    expect(
      resolveTenantIdForEmailSignIn(
        new Headers({ host: 'ida.localhost:3000', cookie: 'tenantId=tenant_mk' }),
        { additionalData: { tenantId: 'evil_tenant' } }
      )
    ).toBeNull();
  });

  it('denies country-host sign-in when the cutover is on', async () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://ks.localhost:3000/api/auth/sign-in/email',
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: { email: 'admin.ks@interdomestik.com' },
      lookupUserTenantByEmail: async () => 'tenant_ks',
    });

    expect(result).toEqual({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'missing_tenant_context',
      resolvedTenantId: null,
    });
  });

  it('allows fresh redirected IDA sign-in when the validated hint matches the user tenant', async () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://ida.localhost:3000/api/auth/sign-in/email',
      headers: new Headers({
        host: 'ida.localhost:3000',
        cookie: 'tenantId=tenant_ks; better-auth.session_token=stale',
      }),
      body: { email: 'admin.mk@interdomestik.com', additionalData: { tenantId: 'tenant_mk' } },
      lookupUserTenantByEmail: async () => 'tenant_mk',
    });

    expect(result).toEqual({ decision: 'allow' });
  });

  it('does not let body hints bypass the country-host cutover block', async () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

    const result = await evaluateEmailSignInTenantGuard({
      url: 'https://ks.localhost:3000/api/auth/sign-in/email',
      headers: new Headers({ host: 'ks.localhost:3000' }),
      body: { email: 'admin.ks@interdomestik.com', additionalData: { tenantId: 'tenant_ks' } },
      lookupUserTenantByEmail: async () => 'tenant_ks',
    });

    expect(result).toEqual({
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'missing_tenant_context',
      resolvedTenantId: null,
    });
  });
});
