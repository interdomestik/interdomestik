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

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

function makeRequest(pathname: string, cookieHeader?: string): NextRequest {
  const headers = new Headers({ host: 'ks.localhost:3000' });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://ks.localhost:3000${pathname}`, { headers });
}

function mockSessionLookup(payload: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
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

describe('proxy auth guard hardening', () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = 'proxy-guard-test-secret-which-is-long-enough-123456';
    process.env.STAFF_AUTH_TOLERANT_TENANTS = '';
    mockEmitAuthTelemetryEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
    delete process.env.STAFF_AUTH_TOLERANT_TENANTS;
  });

  it('emits bounce telemetry when a protected route has no session cookie', async () => {
    const request = makeRequest('/sq/member');

    const response = await proxy(request);

    expectRedirectToLogin(response);
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

  it('keeps protected routes open when session introspection returns a transient non-ok response', async () => {
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
    expectAllowedProtectedRoute(response);
    expectProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
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

  it('keeps protected routes open when session introspection returns a rate-limit client error', async () => {
    const signed = await signSessionToken(
      'token-rate-limit',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = mockSessionLookup({ error: 'too many requests' }, 429);
    const request = makeRequest('/sq/member/documents', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectAllowedProtectedRoute(response);
    expectProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
      surface: 'member',
      pathname: '/sq/member/documents',
    });
  });

  it('keeps protected routes open when session introspection throws a transient transport error', async () => {
    const signed = await signSessionToken(
      'token-network',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const request = makeRequest('/sq/member/documents', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectAllowedProtectedRoute(response);
    expectProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
      surface: 'member',
      pathname: '/sq/member/documents',
    });
  });

  it('allows protected routes only when signed cookie and introspected session are valid', async () => {
    const signed = await signSessionToken('token-xyz', process.env.BETTER_AUTH_SECRET as string);
    const fetchSpy = mockSessionLookup({
      session: {
        id: 's1',
        token: 'token-xyz',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user: { id: 'u1', role: 'member' },
    });
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectAllowedProtectedRoute(response);
    expect(mockEmitAuthTelemetryEvent).not.toHaveBeenCalled();
  });

  it('reuses a recent active session introspection result for the same protected session', async () => {
    const signed = await signSessionToken(
      'token-active-cache',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = mockSessionLookup({
      session: {
        id: 's1',
        token: 'token-active-cache',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user: { id: 'u1', role: 'member' },
    });
    const firstRequest = makeRequest('/sq/member', `better-auth.session_token=${signed}`);
    const secondRequest = makeRequest('/sq/member/claims', `better-auth.session_token=${signed}`);

    const firstResponse = await proxy(firstRequest);
    const secondResponse = await proxy(secondRequest);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expectAllowedProtectedRoute(firstResponse);
    expectAllowedProtectedRoute(secondResponse);
    expect(mockEmitAuthTelemetryEvent).not.toHaveBeenCalled();
  });

  it('retries inactive sessions once for flagged tenants', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = 'tenant_ks';
    const signed = await signSessionToken(
      'token-flagged',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              id: 's1',
              token: 'token-flagged',
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
            user: { id: 'u1', role: 'member' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
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
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
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

  it('allows flagged tenants when the retry returns unknown', async () => {
    process.env.STAFF_AUTH_TOLERANT_TENANTS = 'tenant_ks';
    const signed = await signSessionToken(
      'token-flagged-unknown',
      process.env.BETTER_AUTH_SECRET as string
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: null }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'too many requests' }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        })
      );
    const request = makeRequest('/sq/member', `better-auth.session_token=${signed}`);

    const response = await proxy(request);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
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
