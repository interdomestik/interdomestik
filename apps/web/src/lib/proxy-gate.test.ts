import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resolveTenantHostContext } from '@/lib/tenant/tenant-front-door';
import type { ProxyRequestContext } from './proxy-resolve';

const mockEmitAuthTelemetryEvent = vi.fn();
const mockGetSessionCookieValue = vi.fn();
const mockIsSignedSessionCookieValid = vi.fn();
const mockGetActiveSessionCacheKey = vi.fn();
const mockHasRecentActiveSession = vi.fn();
const mockIntrospectSessionState = vi.fn();
const mockRememberActiveSession = vi.fn();
const mockIsStaffAuthTolerantTenant = vi.fn();

vi.mock('@/lib/telemetry', () => ({
  emitAuthTelemetryEvent: (...args: unknown[]) => mockEmitAuthTelemetryEvent(...args),
}));
vi.mock('@/lib/feature-flags', () => ({
  isStaffAuthTolerantTenant: (...args: unknown[]) => mockIsStaffAuthTolerantTenant(...args),
}));
vi.mock('./proxy-session-state', () => ({
  getSessionCookieValue: (...args: unknown[]) => mockGetSessionCookieValue(...args),
  isSignedSessionCookieValid: (...args: unknown[]) => mockIsSignedSessionCookieValid(...args),
  getActiveSessionCacheKey: (...args: unknown[]) => mockGetActiveSessionCacheKey(...args),
  hasRecentActiveSession: (...args: unknown[]) => mockHasRecentActiveSession(...args),
  introspectSessionState: (...args: unknown[]) => mockIntrospectSessionState(...args),
  rememberActiveSession: (...args: unknown[]) => mockRememberActiveSession(...args),
}));

import { resolveProtectedRouteGuardResponse } from './proxy-gate';

function makeRequest(pathname = '/sq/member'): NextRequest {
  return new NextRequest(`http://ks.localhost:3000${pathname}`, {
    headers: { host: 'ks.localhost:3000' },
  });
}

function makeContext(overrides: Partial<ProxyRequestContext> = {}): ProxyRequestContext {
  return {
    host: 'ks.localhost:3000',
    isLocale: true,
    isProtected: true,
    locale: 'sq',
    localeCandidate: 'sq',
    surface: 'member',
    tenant: 'tenant_ks',
    tenantContext: resolveTenantHostContext('ks.localhost:3000'),
    topLevel: 'member',
    ...overrides,
  };
}

describe('resolveProtectedRouteGuardResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = 'proxy-gate-secret';
    mockGetSessionCookieValue.mockReturnValue('signed-session');
    mockIsSignedSessionCookieValid.mockResolvedValue(true);
    mockGetActiveSessionCacheKey.mockResolvedValue('ks::hash');
    mockHasRecentActiveSession.mockReturnValue(false);
    mockIntrospectSessionState.mockResolvedValue({ state: 'inactive', throttled: false });
    mockIsStaffAuthTolerantTenant.mockReturnValue(false);
  });

  it('does not gate public routes', async () => {
    const response = await resolveProtectedRouteGuardResponse(
      makeRequest('/sq/pricing'),
      makeContext({ isProtected: false, surface: 'unknown', topLevel: 'pricing' })
    );

    expect(response).toBeNull();
    expect(mockGetSessionCookieValue).not.toHaveBeenCalled();
  });

  it('redirects protected routes when the session cookie is missing', async () => {
    mockGetSessionCookieValue.mockReturnValue(null);

    const response = await resolveProtectedRouteGuardResponse(makeRequest(), makeContext());

    expect(response?.status).toBe(307);
    expect(response?.headers.get('location')).toBe('http://ks.localhost:3000/sq/login');
    expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'protected_route_bounce_to_login',
        reason: 'missing_cookie',
      })
    );
  });

  it('redirects protected routes when the signed cookie is invalid', async () => {
    mockIsSignedSessionCookieValid.mockResolvedValue(false);

    const response = await resolveProtectedRouteGuardResponse(makeRequest(), makeContext());

    expect(response?.status).toBe(307);
    expect(mockIntrospectSessionState).not.toHaveBeenCalled();
    expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'protected_route_bounce_to_login',
        reason: 'invalid_cookie',
      })
    );
  });

  it('allows a recently cached active session without introspection', async () => {
    mockHasRecentActiveSession.mockReturnValue(true);

    const response = await resolveProtectedRouteGuardResponse(makeRequest(), makeContext());

    expect(response).toBeNull();
    expect(mockIntrospectSessionState).not.toHaveBeenCalled();
  });

  it('does not retry unknown introspection results for tolerant tenants', async () => {
    mockIsStaffAuthTolerantTenant.mockReturnValue(true);
    mockIntrospectSessionState.mockResolvedValue({ state: 'unknown', throttled: true });

    const response = await resolveProtectedRouteGuardResponse(makeRequest(), makeContext());

    expect(response?.status).toBe(307);
    expect(mockIntrospectSessionState).toHaveBeenCalledTimes(1);
    expect(mockEmitAuthTelemetryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'session_introspection_throttled', reason: 'throttled' })
    );
  });

  it('retries inactive sessions once for tolerant tenants', async () => {
    mockIsStaffAuthTolerantTenant.mockReturnValue(true);
    mockIntrospectSessionState
      .mockResolvedValueOnce({ state: 'inactive', throttled: false })
      .mockResolvedValueOnce({ state: 'active', throttled: false });

    const response = await resolveProtectedRouteGuardResponse(makeRequest(), makeContext());

    expect(response).toBeNull();
    expect(mockIntrospectSessionState).toHaveBeenCalledTimes(2);
    expect(mockRememberActiveSession).toHaveBeenCalledWith('ks::hash');
  });
});
