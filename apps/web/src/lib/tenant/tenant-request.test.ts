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

import { resolveTenantIdFromRequest } from './tenant-request';

describe('tenant-request', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    mocks.headers.mockReset();
    mocks.cookieGet.mockReset();
  });

  afterEach(() => {
    mutableEnv.NODE_ENV = originalNodeEnv;
    mutableEnv.VERCEL_ENV = originalVercelEnv;
  });

  it('Host wins over cookie/header/query', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'ks.localhost:3000',
        'x-tenant-id': 'tenant_mk',
      })
    );
    mocks.cookieGet.mockReturnValue({ value: 'tenant_mk' });

    await expect(resolveTenantIdFromRequest({ tenantIdFromQuery: 'tenant_mk' })).resolves.toBe(
      'tenant_ks'
    );
  });

  it('Cookie is fallback when host is unknown', async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: '127.0.0.1:3000' }));
    mocks.cookieGet.mockReturnValue({ value: 'tenant_ks' });

    await expect(resolveTenantIdFromRequest()).resolves.toBe('tenant_ks');
  });

  it('Header is fallback when host and cookie are missing', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-tenant-id': 'tenant_mk',
      })
    );
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(resolveTenantIdFromRequest()).resolves.toBe('tenant_mk');
  });

  it('Query param is last resort (back-compat only)', async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: 'localhost:3000' }));
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(resolveTenantIdFromRequest({ tenantIdFromQuery: 'tenant_ks' })).resolves.toBe(
      'tenant_ks'
    );
  });

  it('Uses x-forwarded-host before host', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-forwarded-host': 'mk.localhost:3000',
      })
    );
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(resolveTenantIdFromRequest()).resolves.toBe('tenant_mk');
  });

  it('Ignores malformed tenant values', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-tenant-id': 'nope',
      })
    );
    mocks.cookieGet.mockReturnValue({ value: 'nope' });

    await expect(resolveTenantIdFromRequest({ tenantIdFromQuery: 'nope' })).resolves.toBe(null);
  });

  it('keeps non-sensitive fallback behavior in production mode by design', async () => {
    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.VERCEL_ENV;
    mocks.headers.mockResolvedValue(new Headers({ host: 'localhost:3000' }));
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(resolveTenantIdFromRequest({ tenantIdFromQuery: 'tenant_ks' })).resolves.toBe(
      'tenant_ks'
    );
  });
});
