import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LOCALES } from '@/i18n/locales';

const mockEmitAuthTelemetryEvent = vi.fn();

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: LOCALES,
  },
}));

vi.mock('@/lib/telemetry', () => ({
  emitAuthTelemetryEvent: (...args: unknown[]) => mockEmitAuthTelemetryEvent(...args),
}));

import { proxy } from './proxy-logic';

const ORIGINAL_IDA_HOST = process.env.IDA_HOST;
const E2E_ENV_KEYS = ['INTERDOMESTIK_LOCAL_E2E', 'INTERDOMESTIK_E2E_DIAGNOSTICS', 'PLAYWRIGHT'];
let originalE2eEnv: Record<string, string | undefined>;

function restoreIdaHost(): void {
  if (ORIGINAL_IDA_HOST === undefined) {
    delete process.env.IDA_HOST;
    return;
  }

  process.env.IDA_HOST = ORIGINAL_IDA_HOST;
}

function restoreE2eEnv(): void {
  for (const key of E2E_ENV_KEYS) {
    const value = originalE2eEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeRequest(pathname: string, cookieHeader?: string, host = 'ida.localhost:3000') {
  const headers = new Headers({ host });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://${host}${pathname}`, { headers });
}

function expectProxyContext(
  response: Response,
  expected: { tenant: string; context: string; setCookie?: string | null }
): void {
  expect(response.status).toBe(200);
  expect(response.headers.get('x-e2e-tenant')).toBe(expected.tenant);
  expect(response.headers.get('x-e2e-tenant-context')).toBe(expected.context);

  const setCookie = response.headers.get('set-cookie');
  if (expected.setCookie === undefined) return;
  if (expected.setCookie === null) {
    expect(setCookie).toBeNull();
    return;
  }
  expect(setCookie).toContain(expected.setCookie);
}

describe('proxy ida front-door context', () => {
  beforeEach(() => {
    originalE2eEnv = Object.fromEntries(E2E_ENV_KEYS.map(key => [key, process.env[key]]));
    process.env.INTERDOMESTIK_LOCAL_E2E = '1';
    process.env.INTERDOMESTIK_E2E_DIAGNOSTICS = '1';
    process.env.PLAYWRIGHT = '1';
    mockEmitAuthTelemetryEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreE2eEnv();
    restoreIdaHost();
  });

  it('resolves ida.localhost as public no-tenant context without setting a tenant cookie', async () => {
    const response = await proxy(makeRequest('/sq'));

    expectProxyContext(response, { tenant: 'none', context: 'public', setCookie: null });
  });

  it('does not refresh stale tenant cookies on ida public requests', async () => {
    const response = await proxy(
      makeRequest('/sq/pricing', 'tenantId=tenant_mk', 'ida.127.0.0.1.nip.io:3000')
    );

    expectProxyContext(response, { tenant: 'none', context: 'public', setCookie: null });
  });

  it('supports configured IDA_HOST as public no-tenant context', async () => {
    process.env.IDA_HOST = 'https://front-door.localhost:3000';

    const response = await proxy(makeRequest('/sq', undefined, 'front-door.localhost:3000'));

    expectProxyContext(response, { tenant: 'none', context: 'public', setCookie: null });
  });

  it('keeps unknown hosts outside tenant and public cookie handling', async () => {
    const response = await proxy(makeRequest('/sq', undefined, 'example.test'));

    expectProxyContext(response, { tenant: 'none', context: 'unknown', setCookie: null });
  });

  it('keeps country hosts resolving as compatibility aliases', async () => {
    const response = await proxy(makeRequest('/sq', undefined, 'ks.localhost:3000'));

    expectProxyContext(response, {
      tenant: 'tenant_ks',
      context: 'compatibility_alias',
      setCookie: 'tenantId=tenant_ks',
    });
  });

  it('overwrites stale tenant cookies on country-host aliases', async () => {
    const response = await proxy(makeRequest('/sq', 'tenantId=tenant_mk', 'ks.localhost:3000'));

    expectProxyContext(response, {
      tenant: 'tenant_ks',
      context: 'compatibility_alias',
      setCookie: 'tenantId=tenant_ks',
    });
    expect(response.headers.get('set-cookie')).not.toContain('tenantId=tenant_mk');
  });
});
