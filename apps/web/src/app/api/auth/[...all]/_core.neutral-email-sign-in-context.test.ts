import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { evaluateEmailSignInTenantGuard } from './_core';
import {
  clearAmbientEnv,
  CREDENTIALS,
  EXPLICIT_CONTEXT_CASES,
  MEMBER_EMAIL,
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
  headers: Record<string, string>;
  body: unknown;
  accountTenantId: AccountTenantId;
}) {
  const lookupUserTenantByEmail = vi.fn(async () => args.accountTenantId);
  const result = evaluateEmailSignInTenantGuard({
    url: SIGN_IN_URL,
    headers: new Headers(args.headers),
    body: args.body,
    lookupUserTenantByEmail,
  });

  return { result, lookupUserTenantByEmail };
}

describe('neutral single-entry sign-in explicit context', () => {
  it.each<{ name: string; headers: Record<string, string>; body: unknown }>([
    { name: 'invalid non-empty header', headers: { 'x-tenant-id': 'tenant_evil' }, body: {} },
    {
      name: 'comma-joined header values',
      headers: { 'x-tenant-id': 'tenant_mk,tenant_ks' },
      body: {},
    },
    {
      name: 'malformed additionalData',
      headers: {},
      body: { ...CREDENTIALS, additionalData: 'tenant_mk' },
    },
    {
      name: 'unsupported body value',
      headers: {},
      body: { ...CREDENTIALS, additionalData: { tenantId: 'tenant_evil' } },
    },
    {
      name: 'two disagreeing body hints',
      headers: {},
      body: {
        ...CREDENTIALS,
        additionalData: { tenantId: 'tenant_mk', default_booking_tenant_id: 'tenant_ks' },
      },
    },
    {
      name: 'header/body conflict',
      headers: { 'x-tenant-id': 'tenant_mk' },
      body: { ...CREDENTIALS, additionalData: { tenantId: 'tenant_ks' } },
    },
  ])('denies a neutral-host login carrying a $name', async ({ headers, body }) => {
    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'www.interdomestik.com', ...headers },
      body,
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual(MISSING_CONTEXT_DENIAL);
    expect(lookupUserTenantByEmail).not.toHaveBeenCalled();
  });

  it.each(EXPLICIT_CONTEXT_CASES)(
    'allows a matching $shape on the admitted neutral host $host',
    async ({ host, headers, body }) => {
      const { result, lookupUserTenantByEmail } = guard({
        headers: { host, cookie: STALE_TENANT_COOKIE, ...headers },
        body,
        accountTenantId: 'tenant_mk',
      });

      await expect(result).resolves.toEqual({ decision: 'allow' });
      expect(lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
    }
  );

  it.each(EXPLICIT_CONTEXT_CASES)(
    'denies a mismatching $shape on the admitted neutral host $host',
    async ({ host, headers, body }) => {
      const { result, lookupUserTenantByEmail } = guard({
        headers: { host, cookie: STALE_TENANT_COOKIE, ...headers },
        body,
        accountTenantId: 'tenant_ks',
      });

      // The parsed hint is the comparison authority; nothing re-derives it from the host, the stale
      // cookie or the default public tenant.
      await expect(result).resolves.toEqual(tenantMismatchDenial('tenant_mk'));
      expect(lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
    }
  );

  it('compares the parsed hint on a configured neutral entry in a production build', async () => {
    setProductionBuildEnv();
    MUTABLE_ENV.IDA_HOST = 'front-door.localhost:3000';
    const headers = { host: 'front-door.localhost:3000', 'x-tenant-id': 'tenant_mk' };

    const allowed = guard({ headers, body: CREDENTIALS, accountTenantId: 'tenant_mk' });
    await expect(allowed.result).resolves.toEqual({ decision: 'allow' });

    const denied = guard({ headers, body: CREDENTIALS, accountTenantId: 'tenant_ks' });
    await expect(denied.result).resolves.toEqual(tenantMismatchDenial('tenant_mk'));
  });

  it('retains the account mismatch guard for an explicit matching-shape tenant hint', async () => {
    const { result, lookupUserTenantByEmail } = guard({
      headers: { host: 'ida.localhost:3000', 'x-tenant-id': 'tenant_ks' },
      body: CREDENTIALS,
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual(tenantMismatchDenial('tenant_ks'));
    expect(lookupUserTenantByEmail).toHaveBeenCalledExactlyOnceWith(MEMBER_EMAIL);
  });

  it('allows an explicit tenant hint that matches the account tenant', async () => {
    const { result } = guard({
      headers: { host: 'ida.localhost:3000', 'x-tenant-id': 'tenant_mk' },
      body: CREDENTIALS,
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual({ decision: 'allow' });
  });

  it('keeps an explicit booking-context body hint under the mismatch guard', async () => {
    const { result } = guard({
      headers: { host: 'ida.localhost:3000' },
      body: { ...CREDENTIALS, additionalData: { default_booking_tenant_id: 'tenant_ks' } },
      accountTenantId: 'tenant_mk',
    });

    await expect(result).resolves.toEqual(tenantMismatchDenial('tenant_ks'));
  });
});
