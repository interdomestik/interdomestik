import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LOCALES } from '@/i18n/locales';

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: LOCALES,
  },
}));

import { resolveProxyRequestContext } from './proxy-resolve';

function makeRequest(pathname: string, host = 'ks.localhost:3000'): NextRequest {
  return new NextRequest(`http://${host}${pathname}`, {
    headers: { host },
  });
}

describe('resolveProxyRequestContext', () => {
  it.each([
    ['/sq/member', 'member', 'sq'],
    ['/agent', 'agent', 'sq'],
    ['/mk/admin/users', 'admin', 'mk'],
    ['/staff/claims', 'staff', 'sq'],
  ])('preserves canonical protected route detection for %s', (pathname, surface, locale) => {
    const context = resolveProxyRequestContext(makeRequest(pathname));

    expect(context.isProtected).toBe(true);
    expect(context.surface).toBe(surface);
    expect(context.locale).toBe(locale);
    expect(context.tenant).toBe('tenant_ks');
  });

  it('keeps public ida front-door requests outside tenant cookie scope', () => {
    const context = resolveProxyRequestContext(makeRequest('/sq/pricing', 'ida.localhost:3000'));

    expect(context.isProtected).toBe(false);
    expect(context.surface).toBe('unknown');
    expect(context.tenant).toBeNull();
    expect(context.tenantContext.kind).toBe('public');
  });

  it('keeps unknown hosts outside tenant context', () => {
    const context = resolveProxyRequestContext(makeRequest('/sq/member', 'example.test'));

    expect(context.isProtected).toBe(true);
    expect(context.surface).toBe('member');
    expect(context.tenant).toBeNull();
    expect(context.tenantContext.kind).toBe('unknown');
  });
});
