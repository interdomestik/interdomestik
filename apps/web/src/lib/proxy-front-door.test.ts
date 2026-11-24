// @vitest-environment node

import 'next/dist/server/node-environment-baseline';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adapter } from 'next/dist/server/web/adapter';
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

function makeRequest(
  pathname: string,
  cookieHeader?: string,
  host = 'ida.localhost:3000',
  init?: Pick<RequestInit, 'headers' | 'method'>
) {
  const headers = new Headers(init?.headers);
  headers.set('host', host);
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://${host}${pathname}`, { ...init, headers });
}

const actionHeaders = { 'next-action': 'test-action' };
const actionPost = { method: 'POST', headers: actionHeaders };
const matchingKsCookie = 'tenantId=tenant_ks';

function runActionThroughAdapter(
  host: string,
  path: string,
  tenant: string,
  proxyPath = path,
  transportHeaders?: Record<string, string>
) {
  return adapter({
    page: '/src/proxy',
    request: {
      url: `http://${host}${path}`,
      method: 'POST',
      signal: new AbortController().signal,
      headers: {
        host,
        cookie: `tenantId=${tenant}`,
        accept: 'text/x-component',
        ...actionHeaders,
        'next-router-state-tree': encodeURIComponent(JSON.stringify(['', {}])),
        ...transportHeaders,
      },
    },
    handler: request => {
      expect(request.nextUrl.pathname).toBe(proxyPath);
      return proxy(request);
    },
  });
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
  expect(setCookie).toEqual(expect.stringContaining(expected.setCookie));
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

  it.each([
    ['ks.localhost:3000', '/sq', 'tenant_ks'],
    ['mk.localhost:3000', '/mk', 'tenant_mk'],
  ])(
    'keeps hardening without reissuing an identical cookie on %s%s',
    async (host, path, tenant) => {
      const { response } = await runActionThroughAdapter(host, path, tenant);

      expectProxyContext(response, { tenant, context: 'compatibility_alias', setCookie: null });
      expect(response.headers.get('x-middleware-set-cookie')).toBeNull();
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('permissions-policy')).toContain('camera=()');
    }
  );

  it.each([
    ['homepage action with a missing cookie', '/sq', undefined, actionPost],
    ['homepage action with a stale cookie', '/sq', 'tenantId=tenant_mk', actionPost],
    ['homepage GET with the action header', '/sq', matchingKsCookie, { headers: actionHeaders }],
    ['homepage POST without the action header', '/sq', matchingKsCookie, { method: 'POST' }],
    ['action on another localized route', '/sq/pricing', matchingKsCookie, actionPost],
    ['action on an unsupported locale path', '/hr', matchingKsCookie, actionPost],
    ['action on the unlocalized root', '/', matchingKsCookie, actionPost],
    ['action on a locale path with a trailing slash', '/sq/', matchingKsCookie, actionPost],
  ])('writes the host tenant cookie for a %s', async (_scenario, path, cookie, init) => {
    const response = await proxy(makeRequest(path, cookie, 'ks.localhost:3000', init));

    expectProxyContext(response, {
      tenant: 'tenant_ks',
      context: 'compatibility_alias',
      setCookie: matchingKsCookie,
    });
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it.each([
    ['/SQ', '/SQ'],
    ['/sq.segments/_tree.segment.rsc', '/sq.segments/_tree.segment'],
    ['/sq.json', '/sq.json'],
    // Next.js sets x-nextjs-data in the router before the adapter receives the request.
    ['/_next/data/test-build/sq.json', '/sq', { 'x-nextjs-data': '1' }],
    ['/_next/data/test-build/sq.rsc', '/_next/data/test-build/sq'],
    ['/index.rsc', '/index'],
    ['/index.segments/_tree.segment.rsc', '/index.segments/_tree.segment'],
    ['/index.json', '/index.json'],
  ])(
    'writes the host tenant cookie for action POST %s through Next.js',
    async (path, proxyPath, transportHeaders?: Record<string, string>) => {
      const { response } = await runActionThroughAdapter(
        'ks.localhost:3000',
        path,
        'tenant_ks',
        proxyPath,
        transportHeaders
      );

      expectProxyContext(response, {
        tenant: 'tenant_ks',
        context: 'compatibility_alias',
        setCookie: matchingKsCookie,
      });
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
  );
});
