import { describe, expect, it } from 'vitest';

import { GET } from './route';

describe('GET /[locale]/login/tenant-context', () => {
  it('sets HttpOnly tenant cookie and redirects to clean login path', async () => {
    const req = new Request(
      'https://interdomestik-web.vercel.app/sq/login/tenant-context?tenantId=tenant_mk&next=%2Fsq%2Flogin'
    );

    const res = await GET(req, { params: Promise.resolve({ locale: 'sq' }) });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/sq/login');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('tenantId=tenant_mk');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toMatch(/SameSite=lax/i);
  });

  it('redirects to fallback login path when next is invalid and does not set cookie for invalid tenant', async () => {
    const req = new Request(
      'https://interdomestik-web.vercel.app/sq/login/tenant-context?tenantId=invalid&next=https://evil.example'
    );

    const res = await GET(req, { params: Promise.resolve({ locale: 'sq' }) });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://interdomestik-web.vercel.app/sq/login');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
