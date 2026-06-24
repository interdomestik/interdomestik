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
});
