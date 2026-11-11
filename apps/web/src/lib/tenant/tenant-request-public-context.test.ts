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

import {
  resolveTenantContextFromRequest,
  resolveTenantIdFromRequest,
  type ResolveTenantOptions,
} from './tenant-request';

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
    await expect(resolveTenantIdFromRequest()).rejects.toThrow('required');
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

async function inspectTenantId(options: ResolveTenantOptions = {}): Promise<string | null> {
  const context = await resolveTenantContextFromRequest(options);
  return context.kind === 'tenant' ? context.tenantId : null;
}

describe('request context inspection (never anonymous ownership)', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalDefaultPublicTenantId = process.env.DEFAULT_PUBLIC_TENANT_ID;
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
    restoreEnv('NODE_ENV', originalNodeEnv);
    restoreEnv('VERCEL_ENV', originalVercelEnv);
    restoreEnv('DEFAULT_PUBLIC_TENANT_ID', originalDefaultPublicTenantId);
  });

  it('Host wins over cookie/header/query', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'ks.localhost:3000',
        'x-tenant-id': 'tenant_mk',
      })
    );
    mocks.cookieGet.mockReturnValue({ value: 'tenant_mk' });

    await expect(inspectTenantId({ tenantIdFromQuery: 'tenant_mk' })).resolves.toBe('tenant_ks');
  });

  it('Cookie is fallback when host is unknown', async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: '127.0.0.1:3000' }));
    mocks.cookieGet.mockReturnValue({ value: 'tenant_ks' });

    await expect(inspectTenantId()).resolves.toBe('tenant_ks');
  });

  it('Header is fallback when host and cookie are missing', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-tenant-id': 'tenant_mk',
      })
    );
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(inspectTenantId()).resolves.toBe('tenant_mk');
  });

  it('Query param is last resort (back-compat only)', async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: 'localhost:3000' }));
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(inspectTenantId({ tenantIdFromQuery: 'tenant_ks' })).resolves.toBe('tenant_ks');
  });

  it('Uses x-forwarded-host before host', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-forwarded-host': 'mk.localhost:3000',
      })
    );
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(inspectTenantId()).resolves.toBe('tenant_mk');
  });

  it('Ignores malformed tenant values', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-tenant-id': 'nope',
      })
    );
    mocks.cookieGet.mockReturnValue({ value: 'nope' });
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';

    await expect(inspectTenantId({ tenantIdFromQuery: 'nope' })).resolves.toBe('tenant_ks');
  });

  it('uses production-sensitive fallback behavior in production mode by default', async () => {
    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.VERCEL_ENV;
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';
    mocks.headers.mockResolvedValue(new Headers({ host: 'localhost:3000' }));
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(inspectTenantId({ tenantIdFromQuery: 'tenant_mk' })).resolves.toBe('tenant_ks');
  });

  it('retains the diagnostic fallback without supplying anonymous ownership', async () => {
    mutableEnv.DEFAULT_PUBLIC_TENANT_ID = 'tenant_ks';
    mocks.headers.mockResolvedValue(new Headers({ host: '127.0.0.1:3000' }));
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(inspectTenantId()).resolves.toBe('tenant_ks');
  });
});
