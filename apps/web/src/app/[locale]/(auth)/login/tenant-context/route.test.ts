import { describe, expect, it } from 'vitest';

import { GET } from './route';

const PROD_ORIGIN = 'https://interdomestik-web.vercel.app';
const LOCAL_ORIGIN = 'https://localhost:3000';

interface TenantContextRequestOptions {
  headers?: HeadersInit;
  locale?: string;
  next?: string;
  origin?: string;
  protocol?: 'http:' | 'https:';
  tenantId?: string;
}

function tenantContextRequest({
  headers,
  locale = 'sq',
  next = `/${locale}/login`,
  origin = PROD_ORIGIN,
  protocol,
  tenantId = 'tenant_mk',
}: TenantContextRequestOptions = {}): Request {
  const url = new URL(`/${locale}/login/tenant-context`, origin);
  url.searchParams.set('tenantId', tenantId);
  url.searchParams.set('next', next);
  if (protocol) url.protocol = protocol;
  return new Request(url, { headers });
}

function routeParams(locale = 'sq'): { params: Promise<{ locale: string }> } {
  return { params: Promise.resolve({ locale }) };
}

function expectTenantCookie(setCookie: string, { secure }: { secure: boolean }): void {
  expect(setCookie).toContain('tenantId=tenant_mk');
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('Path=/');
  expect(setCookie).toContain('Max-Age=2592000');
  expect(setCookie).toMatch(/SameSite=lax/i);
  if (secure) {
    expect(setCookie).toContain('Secure');
  } else {
    expect(setCookie).not.toContain('Secure');
  }
}

describe('GET /[locale]/login/tenant-context', () => {
  it('sets HttpOnly tenant cookie and redirects to clean login path', async () => {
    const req = tenantContextRequest();

    const res = await GET(req, routeParams());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/sq/login');
    expectTenantCookie(res.headers.get('set-cookie') ?? '', { secure: true });
  });

  it('sets Secure when forwarded proto is https', async () => {
    const req = tenantContextRequest({
      headers: { 'x-forwarded-proto': 'https' },
      protocol: 'http:',
    });

    const res = await GET(req, routeParams());

    expect(res.headers.get('set-cookie')).toContain('Secure');
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/sq/login');
  });

  it('does not set Secure for local http requests', async () => {
    const req = tenantContextRequest({ origin: LOCAL_ORIGIN, protocol: 'http:' });

    const res = await GET(req, routeParams());

    expectTenantCookie(res.headers.get('set-cookie') ?? '', { secure: false });
  });

  it('redirects mk locale requests to the mk login path', async () => {
    const req = tenantContextRequest({ locale: 'mk' });

    const res = await GET(req, routeParams('mk'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/mk/login');
  });

  it('preserves current unsupported locale fallback behavior', async () => {
    const req = tenantContextRequest({ locale: 'zz', next: '/sq/login' });

    const res = await GET(req, routeParams('zz'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/zz/login');
  });

  it('redirects to fallback login path when next is invalid and does not set cookie for invalid tenant', async () => {
    const req = tenantContextRequest({ next: 'https://evil.example', tenantId: 'invalid' });

    const res = await GET(req, routeParams());

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/sq/login');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
