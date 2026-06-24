import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn<() => Promise<Headers>>(),
  cookieGet: vi.fn<(name: string) => { value: string } | undefined>(),
}));

vi.mock('next/headers', () => ({
  headers: async () => mocks.headers(),
  cookies: async () => ({
    get: (name: string) => mocks.cookieGet(name),
  }),
}));

import { resolveTenantContextFromRequest, resolveTenantIdFromRequest } from './tenant-request';

describe('tenant-request public context', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalDefaultPublicTenantId = process.env.DEFAULT_PUBLIC_TENANT_ID;
  const originalIdaHost = process.env.IDA_HOST;

  const restoreEnv = (key: string, value: string | undefined): void => {
    if (value === undefined) {
      delete mutableEnv[key];
      return;
    }
    mutableEnv[key] = value;
  };

  beforeEach(() => {
    mocks.headers.mockReset();
    mocks.cookieGet.mockReset();
  });

  afterEach(() => {
    restoreEnv('DEFAULT_PUBLIC_TENANT_ID', originalDefaultPublicTenantId);
    restoreEnv('IDA_HOST', originalIdaHost);
  });

  it('returns public no-tenant context for ida.localhost even with stale hints', async () => {
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';
    mocks.headers.mockResolvedValue(
      new Headers({ host: 'ida.localhost:3000', 'x-tenant-id': 'tenant_mk' })
    );
    mocks.cookieGet.mockReturnValue({ value: 'tenant_al' });

    await expect(
      resolveTenantContextFromRequest({ tenantIdFromQuery: 'pilot-mk' })
    ).resolves.toEqual({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });
    await expect(resolveTenantIdFromRequest({ tenantIdFromQuery: 'pilot-mk' })).resolves.toBe(
      'tenant_ks'
    );
  });

  it('returns public no-tenant context for arbitrary ida subdomains with stale hints', async () => {
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';
    mocks.headers.mockResolvedValue(
      new Headers({ host: 'ida.staging.interdomestik.com:443', 'x-tenant-id': 'tenant_mk' })
    );
    mocks.cookieGet.mockReturnValue({ value: 'tenant_al' });

    await expect(
      resolveTenantContextFromRequest({ tenantIdFromQuery: 'pilot-mk' })
    ).resolves.toEqual({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });
  });

  it('supports configured IDA_HOST as a public no-tenant context', async () => {
    mutableEnv.IDA_HOST = 'front-door.localhost:3000';
    mocks.headers.mockResolvedValue(new Headers({ host: 'front-door.localhost:3000' }));
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(resolveTenantContextFromRequest()).resolves.toEqual({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });
  });
});
