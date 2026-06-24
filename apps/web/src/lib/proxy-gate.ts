import { NextRequest, NextResponse } from 'next/server';

import { isStaffAuthTolerantTenant } from '@/lib/feature-flags';
import { emitAuthTelemetryEvent } from '@/lib/telemetry';
import { resolveEntryHostIdFromHeaders } from '@/lib/tenant/host-id';

import type { ProxyRequestContext } from './proxy-resolve';
import {
  SessionIntrospectionObservation,
  getActiveSessionCacheKey,
  getSessionCookieValue,
  hasRecentActiveSession,
  introspectSessionState,
  isSignedSessionCookieValid,
  rememberActiveSession,
} from './proxy-session-state';

type ProtectedRouteContext = ProxyRequestContext & {
  request: NextRequest;
};

function canUseProtectedRouteTolerance(tenant: string | null): boolean {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  return Boolean(secret && isStaffAuthTolerantTenant(tenant));
}

function redirectToLogin(context: ProtectedRouteContext): NextResponse {
  const locale = context.isLocale ? context.localeCandidate : 'sq';
  const url = context.request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  const response = NextResponse.redirect(url);
  response.headers.set('x-auth-guard', 'middleware-redirect');
  return response;
}

function emitProtectedRouteTelemetry(params: {
  eventName: 'protected_route_bounce_to_login' | 'session_introspection_throttled';
  reason: 'missing_cookie' | 'invalid_cookie' | 'inactive_session' | 'throttled';
  context: ProtectedRouteContext;
}): void {
  emitAuthTelemetryEvent({
    eventName: params.eventName,
    tenant: params.context.tenant,
    locale: params.context.locale,
    surface: params.context.surface,
    host: params.context.request.headers.get('host'),
    hostId: resolveEntryHostIdFromHeaders(params.context.request.headers),
    pathname: params.context.request.nextUrl.pathname,
    reason: params.reason,
  });
}

function redirectProtectedRouteToLogin(
  context: ProtectedRouteContext,
  reason: 'missing_cookie' | 'invalid_cookie' | 'inactive_session'
): NextResponse {
  emitProtectedRouteTelemetry({
    eventName: 'protected_route_bounce_to_login',
    reason,
    context,
  });
  return redirectToLogin(context);
}

function redirectInactiveSession(
  context: ProtectedRouteContext,
  observation: SessionIntrospectionObservation
): NextResponse {
  if (observation.state === 'unknown' && observation.throttled) {
    emitProtectedRouteTelemetry({
      eventName: 'session_introspection_throttled',
      reason: 'throttled',
      context,
    });
  }
  return redirectProtectedRouteToLogin(context, 'inactive_session');
}

async function resolveProtectedRouteResponse(
  context: ProtectedRouteContext,
  sessionCookieValue: string
): Promise<NextResponse | null> {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (secret && !(await isSignedSessionCookieValid(sessionCookieValue, secret))) {
    return redirectProtectedRouteToLogin(context, 'invalid_cookie');
  }

  const cacheKey = await getActiveSessionCacheKey(context.request, sessionCookieValue);
  if (hasRecentActiveSession(cacheKey)) return null;

  const firstIntrospection = await introspectSessionState(context.request);
  if (firstIntrospection.state === 'active') {
    rememberActiveSession(cacheKey);
    return null;
  }
  if (firstIntrospection.state === 'unknown') {
    return redirectInactiveSession(context, firstIntrospection);
  }
  if (!canUseProtectedRouteTolerance(context.tenant)) {
    return redirectProtectedRouteToLogin(context, 'inactive_session');
  }

  const retryIntrospection = await introspectSessionState(context.request);
  if (retryIntrospection.state === 'active') {
    rememberActiveSession(cacheKey);
    return null;
  }
  return redirectInactiveSession(context, retryIntrospection);
}

export async function resolveProtectedRouteGuardResponse(
  request: NextRequest,
  context: ProxyRequestContext
): Promise<NextResponse | null> {
  if (!context.isProtected) return null;

  const protectedRouteContext = { ...context, request };
  const sessionCookieValue = getSessionCookieValue(request);
  if (!sessionCookieValue) {
    return redirectProtectedRouteToLogin(protectedRouteContext, 'missing_cookie');
  }
  return resolveProtectedRouteResponse(protectedRouteContext, sessionCookieValue);
}
