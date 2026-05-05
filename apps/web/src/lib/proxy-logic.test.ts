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

const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_VERCEL_ENV = process.env.VERCEL_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  let encoded = btoa(binary).replaceAll('+', '-').replaceAll('/', '_');
  while (encoded.endsWith('=')) {
    encoded = encoded.slice(0, -1);
  }

  return encoded;
}

async function signSessionToken(token: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(token));
  return `${token}.${toBase64Url(new Uint8Array(signature))}`;
}

function makeRequest(
  pathname: string,
  cookieHeader?: string,
  init?: { protocol?: 'http:' | 'https:'; headers?: HeadersInit }
): NextRequest {
  const protocol = init?.protocol ?? 'http:';
  const headers = new Headers({ host: 'ks.localhost:3000', ...init?.headers });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`${protocol}//ks.localhost:3000${pathname}`, { headers });
}

function mockSessionLookup(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(payload, status));
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function activeSessionPayload(token: string): unknown {
  return {
    session: {
      id: 's1',
      token,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    user: { id: 'u1', role: 'member' },
  };
}

function expectRedirectToLogin(response: Response): void {
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe('http://ks.localhost:3000/sq/login');
}

function expectProtectedRouteTelemetry(params: {
  eventName: 'protected_route_bounce_to_login' | 'session_introspection_throttled';
  reason: 'missing_cookie' | 'invalid_cookie' | 'inactive_session' | 'throttled';
  surface: 'staff' | 'member' | 'admin' | 'agent';
  pathname: string;
}): void {
  expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      eventName: params.eventName,
      reason: params.reason,
      tenant: 'tenant_ks',
      locale: 'sq',
      surface: params.surface,
      pathname: params.pathname,
    })
  );
}

function expectAllowedProtectedRoute(response: Response): void {
  expect(response.status).toBe(200);
  expect(response.headers.get('x-e2e-tenant')).toBe('tenant_ks');
}

function expectBaseSecurityHeaders(response: Response): string {
  const csp = response.headers.get('content-security-policy');

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(response.headers.get('x-frame-options')).toBe('DENY');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  expect(response.headers.get('permissions-policy')).toContain('camera=()');
  return csp ?? '';
}

function expectCompatibleSecurityHeaders(response: Response): void {
  const csp = expectBaseSecurityHeaders(response);

  expect(csp).toContain("script-src 'self' 'unsafe-inline'");
}

describe('proxy auth guard hardening', () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'proxy-guard-test-secret-which-is-long-enough-123456';
    process.env.STAFF_AUTH_TOLERANT_TENANTS = '';
    process.env.INTERDOMESTIK_LOCAL_E2E = '1';
    process.env.INTERDOMESTIK_E2E_DIAGNOSTICS = '1';
    process.env.PLAYWRIGHT = '1';
    mockEmitAuthTelemetryEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
    delete process.env.STAFF_AUTH_TOLERANT_TENANTS;
    delete process.env.INTERDOMESTIK_LOCAL_E2E;
    delete process.env.INTERDOMESTIK_E2E_DIAGNOSTICS;
    delete process.env.PLAYWRIGHT;
    mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
    mutableEnv.VERCEL_ENV = ORIGINAL_VERCEL_ENV;
  });

  it('emits bounce telemetry when a protected route has no session cookie', async () => {
    const request = makeRequest('/sq/member');

    const response = await proxy(request);

    expectRedirectToLogin(response);
    expectCompatibleSecurityHeaders(response);
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'missing_cookie',
      surface: 'member',
      pathname: '/sq/member',
    });
  });

  it('redirects protected routes when session cookie signature is invalid', async () => {
    const request = makeRequest('/sq/member', 'better-auth.session_token=tampered.invalid');

    const response = await proxy(request);

    expectRedirectToLogin(response);
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'invalid_cookie',
      surface: 'member',
      pathname: '/sq/member',
    });
  });

  it('redirects when signed cookie exists but session introspection returns null', async () => {
    const signed = await signSessionToken('token-abc', process.env.BETTER_AUTH_SECRET as string);
    const fetchSpy = mockSessionLookup(null);
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectRedirectToLogin(response);
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'inactive_session',
      surface: 'member',
      pathname: '/sq/member',
    });
  });

  it('redirects protected routes when session introspection returns a transient non-ok response', async () => {
    const signed = await signSessionToken(
      'token-transient',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = mockSessionLookup({ error: 'temporary upstream failure' }, 503);
    const request = makeRequest(
      '/sq/staff/claims/golden_ks_a_claim_17',
      `better-auth.session_token=${signed}`
    );

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectRedirectToLogin(response);
    expectProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
      surface: 'staff',
      pathname: '/sq/staff/claims/golden_ks_a_claim_17',
    });
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'inactive_session',
      surface: 'staff',
      pathname: '/sq/staff/claims/golden_ks_a_claim_17',
    });
  });

  it('redirects protected routes when session introspection returns an auth client error', async () => {
    const signed = await signSessionToken(
      'token-auth-error',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = mockSessionLookup({ error: 'session expired' }, 401);
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectRedirectToLogin(response);
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'inactive_session',
      surface: 'member',
      pathname: '/sq/member',
    });
  });

  it('redirects protected routes when session introspection returns a rate-limit client error', async () => {
    const signed = await signSessionToken(
      'token-rate-limit',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = mockSessionLookup({ error: 'too many requests' }, 429);
    const request = makeRequest('/sq/member/documents', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectRedirectToLogin(response);
    expectProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
      surface: 'member',
      pathname: '/sq/member/documents',
    });
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'inactive_session',
      surface: 'member',
      pathname: '/sq/member/documents',
    });
  });

  it('redirects protected routes when session introspection throws a transient transport error', async () => {
    const signed = await signSessionToken(
      'token-network',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const request = makeRequest('/sq/member/documents', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectRedirectToLogin(response);
    expectProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
      surface: 'member',
      pathname: '/sq/member/documents',
    });
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'inactive_session',
      surface: 'member',
      pathname: '/sq/member/documents',
    });
  });

  it('allows protected routes only when signed cookie and introspected session are valid', async () => {
    const signed = await signSessionToken('token-xyz', process.env.BETTER_AUTH_SECRET as string);
    const fetchSpy = mockSessionLookup(activeSessionPayload('token-xyz'));
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectAllowedProtectedRoute(response);
    expectCompatibleSecurityHeaders(response);
    expect(mockEmitAuthTelemetryEvent).not.toHaveBeenCalled();
  });

  it('reuses a recent active session introspection result for the same protected session', async () => {
    const signed = await signSessionToken(
      'token-active-cache',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = mockSessionLookup(activeSessionPayload('token-active-cache'));
    const firstRequest = makeRequest('/sq/member', `better-auth.session_token=${signed}`);
    const secondRequest = makeRequest('/sq/member/claims', `better-auth.session_token=${signed}`);

    const firstResponse = await proxy(firstRequest);
    const secondResponse = await proxy(secondRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectAllowedProtectedRoute(firstResponse);
    expectAllowedProtectedRoute(secondResponse);
    expectCompatibleSecurityHeaders(firstResponse);
    expectCompatibleSecurityHeaders(secondResponse);
    expect(mockEmitAuthTelemetryEvent).not.toHaveBeenCalled();
  });

  it('uses a client-compatible CSP for public static routes', async () => {
    const request = makeRequest('/sq');

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expectCompatibleSecurityHeaders(response);
  });

  it('sets the tenant cookie with hardened defaults on allowed responses', async () => {
    const signed = await signSessionToken(
      'token-cookie-hardening',
      process.env.BETTER_AUTH_SECRET as string
    );
    mockSessionLookup({
      session: {
        id: 's1',
        token: 'token-cookie-hardening',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user: { id: 'u1', role: 'member' },
    });
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);
    const setCookie = response.headers.get('set-cookie');

    expect(response.status).toBe(200);
    expect(setCookie).toContain('tenantId=tenant_ks');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=2592000');
  });

  it('sets Secure on the tenant cookie in production deployments', async () => {
    mutableEnv.NODE_ENV = 'production';
    const request = makeRequest('/sq/pricing', undefined, {
      protocol: 'https:',
    });

    const response = await proxy(request);

    expect(response.headers.get('set-cookie')).toContain('Secure');
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=15552000; includeSubDomains'
    );
  });

  it('does not emit HTTPS-only headers on local HTTP production builds', async () => {
    mutableEnv.NODE_ENV = 'production';
    const request = makeRequest('/sq/pricing');

    const response = await proxy(request);

    expect(response.headers.get('content-security-policy')).not.toContain(
      'upgrade-insecure-requests'
    );
    expect(response.headers.get('strict-transport-security')).toBeNull();
  });

  it('retries inactive sessions once for flagged tenants', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = 'tenant_ks';
    const signed = await signSessionToken(
      'token-flagged',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ session: null }))
      .mockResolvedValueOnce(jsonResponse(activeSessionPayload('token-flagged')));
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(mockEmitAuthTelemetryEvent).not.toHaveBeenCalled();
  });

  it('redirects after a second inactive response for flagged tenants', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = 'tenant_ks';
    const signed = await signSessionToken(
      'token-flagged-inactive',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ session: null }))
      .mockResolvedValueOnce(jsonResponse({ session: null }));
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://ks.localhost:3000/sq/login');
    expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'protected_route_bounce_to_login',
        reason: 'inactive_session',
        tenant: 'tenant_ks',
        locale: 'sq',
        surface: 'member',
        pathname: '/sq/member',
      })
    );
  });

  it('redirects flagged tenants when the retry returns unknown', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = 'tenant_ks';
    const signed = await signSessionToken(
      'token-flagged-unknown',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ session: null }))
      .mockResolvedValueOnce(jsonResponse({ error: 'too many requests' }, 429));
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expectRedirectToLogin(response);
    expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'session_introspection_throttled',
        reason: 'throttled',
        tenant: 'tenant_ks',
        locale: 'sq',
        surface: 'member',
        pathname: '/sq/member',
      })
    );
    expectProtectedRouteTelemetry({
      eventName: 'protected_route_bounce_to_login',
      reason: 'inactive_session',
      surface: 'member',
      pathname: '/sq/member',
    });
  });

  it('falls back to current inactive behavior when the auth secret is absent', async () => {
    process.env.BETTER_AUTH_SECRET = '';
    process.env.STAFF_AUTH_TOLERANT_TENANTS = 'tenant_ks';
    const signed = await signSessionToken(
      'token-no-secret',
      'proxy-guard-test-secret-which-is-long-enough-123456'
    );
    const fetchSpy = mockSessionLookup(null);
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://ks.localhost:3000/sq/login');
    expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'protected_route_bounce_to_login',
        reason: 'inactive_session',
        tenant: 'tenant_ks',
        locale: 'sq',
        surface: 'member',
        pathname: '/sq/member',
      })
    );
  });
});
