import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateEmailSignInTenantGuard, evaluateNeutralSingleEntryEmailSignIn } from './_core';
import {
  clearAmbientEnv,
  CREDENTIALS,
  MISSING_CONTEXT_DENIAL,
  MUTABLE_ENV,
  restoreManagedEnv,
  setProductionBuildEnv,
  SIGN_IN_URL,
  snapshotManagedEnv,
  STALE_TENANT_COOKIE,
  tenantMismatchDenial,
  type AccountTenantId,
} from './_core.neutral-email-sign-in.fixtures';

const originalEnv = new Map<string, string | undefined>();

beforeEach(() => {
  snapshotManagedEnv(originalEnv);
  clearAmbientEnv();
});

afterEach(() => restoreManagedEnv(originalEnv));

function guard(args: {
  url?: string;
  headers: Record<string, string>;
  body: unknown;
  accountTenantId?: AccountTenantId | null;
}) {
  const lookupUserTenantByEmail = vi.fn(async () => args.accountTenantId ?? null);
  const result = evaluateEmailSignInTenantGuard({
    url: args.url ?? SIGN_IN_URL,
    headers: new Headers(args.headers),
    body: args.body,
    lookupUserTenantByEmail,
  });

  return { result, lookupUserTenantByEmail };
}

describe('neutral single-entry sign-in delegation', () => {
  it.each([
    { host: 'www.interdomestik.com', accountTenantId: 'tenant_ks' as const },
    { host: 'interdomestik.com', accountTenantId: 'tenant_mk' as const },
    { host: 'app.interdomestik.com', accountTenantId: 'pilot-mk' as const },
    { host: 'ida.interdomestik.com', accountTenantId: 'tenant_al' as const },
    { host: 'staging.interdomestik.com', accountTenantId: 'tenant_mk' as const },
    { host: 'interdomestik-web.vercel.app', accountTenantId: 'pilot-mk' as const },
    { host: 'ida.localhost:3000', accountTenantId: 'tenant_mk' as const },
    { host: 'ida.127.0.0.1.nip.io:3000', accountTenantId: 'tenant_ks' as const },
  ])(
    'delegates a no-hint $accountTenantId identity on $host without a tenant lookup',
    async ({ host, accountTenantId }) => {
      const { result, lookupUserTenantByEmail } = guard({
        headers: { host },
        body: CREDENTIALS,
        accountTenantId,
      });

      await expect(result).resolves.toEqual({ decision: 'allow' });
      expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
    }
  );

  it('keeps neutral admission in a production build', async () => {
    setProductionBuildEnv();

    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'www.interdomestik.com' },
      body: CREDENTIALS,
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual({ decision: 'allow' });
    expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it('does not let a stale tenant cookie select the identity of a neutral no-hint login', async () => {
    const { result, lookupUserTenantByEmail } = guard({
      headers: {
        host: 'ida.localhost:3000',
        cookie: 'tenantId=tenant_ks; better-auth.session_token=stale',
      },
      body: CREDENTIALS,
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual({ decision: 'allow' });
    expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it('admits a neutral request whose forwarded host agrees with the direct host', async () => {
    const { result } = guard({
      headers: {
        host: 'www.interdomestik.com',
        'x-forwarded-host': 'www.interdomestik.com',
        origin: 'https://evil.example',
      },
      body: CREDENTIALS,
      accountTenantId: 'tenant_mk',
    });

    // Origin and credential verification stay with the provider; admission only decides delegation.
    await expect(result).resolves.toEqual({ decision: 'allow' });
  });

  it('keeps delegating when the submitted account does not exist', async () => {
    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'www.interdomestik.com' },
      body: { email: 'nobody@interdomestik.test', password: 'wrong' },
      accountTenantId: null,
    });

    await expect(result).resolves.toEqual({ decision: 'allow' });
    expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it.each(['ks.interdomestik.com', 'mk.localhost:3000', 'pilot.localhost:3000'])(
    'keeps the country cutover denial on %s while the flag is enabled',
    async host => {
      MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'true';

      const { result } = guard({
        headers: { host },
        body: CREDENTIALS,
        accountTenantId: 'tenant_mk',
      });

      await expect(result).resolves.toEqual(MISSING_CONTEXT_DENIAL);
    }
  );

  it('keeps country alias account-mismatch behaviour while the flag is disabled', async () => {
    MUTABLE_ENV.FEATURE_IDA_LIVE_LOGIN_CUTOVER = 'false';

    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'ks.localhost:3000' },
      body: CREDENTIALS,
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual(tenantMismatchDenial('tenant_ks'));
    expect(lookupUserTenantByEmail).toHaveBeenCalledTimes(1);
  });

  it('leaves unrelated auth endpoints untouched', async () => {
    for (const url of [
      'https://www.interdomestik.com/api/auth/sign-in/email-otp',
      'https://www.interdomestik.com/api/auth/sign-up/email',
      'https://www.interdomestik.com/api/auth/get-session',
      'https://www.interdomestik.com/api/auth/request-password-reset',
    ]) {
      const { result, lookupUserTenantByEmail } = guard({
        url,
        headers: { host: 'www.interdomestik.com' },
        body: CREDENTIALS,
        accountTenantId: 'tenant_mk',
      });

      await expect(result).resolves.toBeNull();
      expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
    }
  });

  it('keeps the neutral-entry states distinct', () => {
    expect(
      evaluateNeutralSingleEntryEmailSignIn(
        new Headers({ host: 'www.interdomestik.com', cookie: STALE_TENANT_COOKIE }),
        CREDENTIALS
      )
    ).toEqual({ kind: 'delegate_to_provider' });
    expect(
      evaluateNeutralSingleEntryEmailSignIn(
        new Headers({ host: 'ks.interdomestik.com' }),
        CREDENTIALS
      )
    ).toEqual({ kind: 'not_applicable' });
    expect(
      evaluateNeutralSingleEntryEmailSignIn(new Headers({ host: 'localhost:3000' }), CREDENTIALS)
    ).toEqual({ kind: 'not_applicable' });
    expect(
      evaluateNeutralSingleEntryEmailSignIn(new Headers({ host: 'www.interdomestik.com' }), {
        ...CREDENTIALS,
        additionalData: { tenantId: 'tenant_mk' },
      })
    ).toEqual({ kind: 'compare_explicit_tenant', tenantId: 'tenant_mk' });
    expect(
      evaluateNeutralSingleEntryEmailSignIn(new Headers({ host: 'www.interdomestik.com' }), {
        ...CREDENTIALS,
        additionalData: { tenantId: 'tenant_evil' },
      })
    ).toEqual({ kind: 'reject' });
    expect(
      evaluateNeutralSingleEntryEmailSignIn(new Headers({ host: 'ida.evil.example' }), CREDENTIALS)
    ).toEqual({ kind: 'reject' });
  });
});
