import { routing } from '@/i18n/routing';
import { isStaffAuthTolerantTenant } from '@/lib/feature-flags';
import { isE2EDiagnosticsEnabled, isProductionDeployment } from '@/lib/runtime-environment';
import { emitAuthTelemetryEvent } from '@/lib/telemetry';
import { resolveTenantHostContext } from '@/lib/tenant/tenant-front-door';
import { buildIdaLiveLoginRedirectUrl } from '@/lib/tenant/ida-live-login-cutover';
import { applyTenantCookie } from '@/lib/tenant/tenant-cookie';
import { NextRequest, NextResponse } from 'next/server';
import {
  buildReportOnlyCsp,
  buildReportToHeader,
  generateCspNonce,
  isCspNonceActive,
} from '@/lib/security/csp-nonce';

const PROTECTED_TOP_LEVEL = new Set(['member', 'admin', 'staff', 'agent']);
const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Host-better-auth.session_token',
] as const;
const ACTIVE_SESSION_CACHE_TTL_MS = 2000;
const ACTIVE_SESSION_CACHE_MAX_ENTRIES = 100;
const activeSessionCache = new Map<string, number>();

type SecurityHeaders = {
  requestHeaders?: Headers;
  responseHeaders: Headers;
};

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  return request.nextUrl.protocol === 'https:' || forwardedProto?.toLowerCase() === 'https';
}

function compactHeader(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function buildContentSecurityPolicy(request: NextRequest): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://www.google-analytics.com https://cdn.paddle.com https://*.paddle.com ${isDevelopment ? "'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://api.paddle.com https://*.paddle.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://graph.facebook.com",
    "frame-src 'self' https://*.paddle.com https://buy.paddle.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    isProductionDeployment() && isHttpsRequest(request) ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean);

  return compactHeader(directives.join('; '));
}

function createSecurityHeaders(request: NextRequest): SecurityHeaders {
  const csp = buildContentSecurityPolicy(request);
  const responseHeaders = new Headers();
  const isProductionHttps = isProductionDeployment() && isHttpsRequest(request);

  responseHeaders.set('Content-Security-Policy', csp);
  responseHeaders.set('X-Frame-Options', 'DENY');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  responseHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  let requestHeaders: Headers | undefined;
  if (isCspNonceActive()) {
    const nonce = generateCspNonce();
    const reportOnlyCsp = buildReportOnlyCsp({ nonce, isProductionHttps });

    requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', reportOnlyCsp);
    requestHeaders.set('Content-Security-Policy-Report-Only', reportOnlyCsp);

    responseHeaders.set('Content-Security-Policy-Report-Only', reportOnlyCsp);
    responseHeaders.set('Report-To', buildReportToHeader());
    responseHeaders.set('x-nonce', nonce);
  }

  if (isProductionHttps) {
    responseHeaders.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  return { requestHeaders, responseHeaders };
}

function applyResponseHardening(
  response: NextResponse,
  request: NextRequest,
  tenant: string | null,
  securityHeaders: SecurityHeaders
): NextResponse {
  for (const [name, value] of securityHeaders.responseHeaders.entries()) {
    response.headers.set(name, value);
  }

  if (tenant) {
    applyTenantCookie(response, tenant, request);
  }

  return response;
}

function getSessionCookieValue(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return value;
  }
  return null;
}

async function getActiveSessionCacheKey(
  request: NextRequest,
  sessionCookieValue: string
): Promise<string> {
  const host = request.headers.get('host') ?? '';
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(sessionCookieValue));
  const sessionHash = Array.from(new Uint8Array(digest), value =>
    value.toString(16).padStart(2, '0')
  ).join('');
  return `${host}::${sessionHash}`;
}

function pruneExpiredActiveSessions(now: number): void {
  for (const [key, expiresAt] of activeSessionCache.entries()) {
    if (expiresAt <= now) {
      activeSessionCache.delete(key);
    }
  }
}

function rememberActiveSession(cacheKey: string): void {
  const now = Date.now();
  pruneExpiredActiveSessions(now);

  while (activeSessionCache.size >= ACTIVE_SESSION_CACHE_MAX_ENTRIES) {
    const oldestKey = activeSessionCache.keys().next().value;
    if (!oldestKey) break;
    activeSessionCache.delete(oldestKey);
  }

  activeSessionCache.set(cacheKey, now + ACTIVE_SESSION_CACHE_TTL_MS);
}

function hasRecentActiveSession(cacheKey: string): boolean {
  const expiresAt = activeSessionCache.get(cacheKey);
  if (!expiresAt) return false;

  if (expiresAt <= Date.now()) {
    activeSessionCache.delete(cacheKey);
    return false;
  }

  return true;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);

    for (let index = 0; index < raw.length; index++) {
      bytes[index] = raw.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

async function isSignedSessionCookieValid(signedValue: string, secret: string): Promise<boolean> {
  const decodedValue = safeDecodeURIComponent(signedValue);
  const separatorIndex = decodedValue.lastIndexOf('.');

  if (separatorIndex <= 0 || separatorIndex === decodedValue.length - 1) return false;

  const token = decodedValue.slice(0, separatorIndex);
  const signature = decodedValue.slice(separatorIndex + 1);
  const signatureBytes = base64UrlToBytes(signature);

  if (!signatureBytes) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes as unknown as BufferSource,
    encoder.encode(token)
  );
}

function isActiveSessionPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;

  const session = (payload as { session?: { expiresAt?: unknown } }).session;
  if (!session || typeof session !== 'object') return false;

  const rawExpiresAt = session.expiresAt;
  if (!rawExpiresAt) return false;

  const expiresAtTimestamp =
    rawExpiresAt instanceof Date
      ? rawExpiresAt.getTime()
      : typeof rawExpiresAt === 'number'
        ? rawExpiresAt
        : Date.parse(String(rawExpiresAt));

  if (!Number.isFinite(expiresAtTimestamp)) return false;

  return expiresAtTimestamp > Date.now();
}

type SessionIntrospectionResult = 'active' | 'inactive' | 'unknown';

type SessionIntrospectionObservation = {
  state: SessionIntrospectionResult;
  throttled: boolean;
};

async function introspectSessionState(
  request: NextRequest
): Promise<SessionIntrospectionObservation> {
  try {
    const url = request.nextUrl.clone();
    url.pathname = '/api/auth/get-session';
    url.search = '?disableCookieCache=true&disableRefresh=true';

    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return { state: 'inactive', throttled: false };

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { state: 'unknown', throttled: true };
      }

      if (response.status >= 400 && response.status < 500) {
        return { state: 'inactive', throttled: false };
      }

      return { state: 'unknown', throttled: true };
    }

    const payload = await response.json();
    return {
      state: isActiveSessionPayload(payload) ? 'active' : 'inactive',
      throttled: false,
    };
  } catch {
    return { state: 'unknown', throttled: true };
  }
}

function getTelemetrySurface(
  topLevel: string | undefined
): 'staff' | 'member' | 'admin' | 'agent' | 'unknown' {
  if (
    topLevel === 'staff' ||
    topLevel === 'member' ||
    topLevel === 'admin' ||
    topLevel === 'agent'
  ) {
    return topLevel;
  }

  return 'unknown';
}

function emitProtectedRouteTelemetry(params: {
  eventName: 'protected_route_bounce_to_login' | 'session_introspection_throttled';
  reason: 'missing_cookie' | 'invalid_cookie' | 'inactive_session' | 'throttled';
  request: NextRequest;
  tenant: string | null;
  locale: string;
  surface: 'staff' | 'member' | 'admin' | 'agent' | 'unknown';
}): void {
  emitAuthTelemetryEvent({
    eventName: params.eventName,
    tenant: params.tenant,
    locale: params.locale,
    surface: params.surface,
    host: params.request.headers.get('host'),
    pathname: params.request.nextUrl.pathname,
    reason: params.reason,
  });
}

type ProtectedRouteContext = {
  request: NextRequest;
  tenant: string | null;
  locale: string;
  surface: 'staff' | 'member' | 'admin' | 'agent' | 'unknown';
  isLocale: boolean;
  localeCandidate?: string;
};

function redirectProtectedRouteToLogin(
  context: ProtectedRouteContext,
  reason: 'missing_cookie' | 'invalid_cookie' | 'inactive_session'
): NextResponse {
  emitProtectedRouteTelemetry({
    eventName: 'protected_route_bounce_to_login',
    reason,
    request: context.request,
    tenant: context.tenant,
    locale: context.locale,
    surface: context.surface,
  });

  return redirectToLogin(context.request, context.isLocale, context.localeCandidate);
}

function emitThrottledSessionTelemetry(context: ProtectedRouteContext): void {
  emitProtectedRouteTelemetry({
    eventName: 'session_introspection_throttled',
    reason: 'throttled',
    request: context.request,
    tenant: context.tenant,
    locale: context.locale,
    surface: context.surface,
  });
}

async function resolveProtectedRouteResponse(
  context: ProtectedRouteContext,
  sessionCookieValue: string,
  canUseTolerance: boolean
): Promise<NextResponse | null> {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (secret) {
    const isSignedCookieValid = await isSignedSessionCookieValid(sessionCookieValue, secret);
    if (!isSignedCookieValid) {
      return redirectProtectedRouteToLogin(context, 'invalid_cookie');
    }
  }

  const cacheKey = await getActiveSessionCacheKey(context.request, sessionCookieValue);
  if (hasRecentActiveSession(cacheKey)) {
    return null;
  }

  const firstIntrospection = await introspectSessionState(context.request);
  if (firstIntrospection.state === 'active') {
    rememberActiveSession(cacheKey);
    return null;
  }

  if (firstIntrospection.state === 'unknown') {
    if (firstIntrospection.throttled) {
      emitThrottledSessionTelemetry(context);
    }
    return redirectProtectedRouteToLogin(context, 'inactive_session');
  }

  if (!canUseTolerance) {
    return redirectProtectedRouteToLogin(context, 'inactive_session');
  }

  const retryIntrospection = await introspectSessionState(context.request);
  if (retryIntrospection.state === 'active') {
    rememberActiveSession(cacheKey);
    return null;
  }

  if (retryIntrospection.state === 'unknown') {
    if (retryIntrospection.throttled) {
      emitThrottledSessionTelemetry(context);
    }
    return redirectProtectedRouteToLogin(context, 'inactive_session');
  }

  return redirectProtectedRouteToLogin(context, 'inactive_session');
}

function redirectToLogin(
  request: NextRequest,
  isLocale: boolean,
  localeCandidate?: string
): NextResponse {
  const locale = isLocale ? localeCandidate : 'sq';
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/login`;
  const response = NextResponse.redirect(url);
  response.headers.set('x-auth-guard', 'middleware-redirect');
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') ?? '';
  const tenantContext = resolveTenantHostContext(host);
  const tenant = tenantContext.tenantId;
  const securityHeaders = createSecurityHeaders(request);
  const idaLiveLoginRedirectUrl = buildIdaLiveLoginRedirectUrl(request.nextUrl, host);
  if (idaLiveLoginRedirectUrl) {
    const redirectResponse = NextResponse.redirect(idaLiveLoginRedirectUrl, 301);
    redirectResponse.headers.set('x-ida-live-login-cutover', 'country-host-redirect');
    return applyResponseHardening(redirectResponse, request, null, securityHeaders);
  }

  const segments = pathname.split('/');
  const possibleLocale = segments[1];
  const isLocale = routing.locales.includes(possibleLocale as (typeof routing.locales)[number]);
  const topLevel = isLocale ? segments[2] : segments[1];
  const locale = isLocale ? possibleLocale : 'sq';
  const surface = getTelemetrySurface(topLevel);

  const isProtected = PROTECTED_TOP_LEVEL.has(topLevel);
  const sessionCookieValue = isProtected ? getSessionCookieValue(request) : null;
  const protectedRouteContext: ProtectedRouteContext = {
    request,
    tenant,
    locale,
    surface,
    isLocale,
    localeCandidate: possibleLocale,
  };

  if (isProtected && !sessionCookieValue) {
    return applyResponseHardening(
      redirectProtectedRouteToLogin(protectedRouteContext, 'missing_cookie'),
      request,
      tenant,
      securityHeaders
    );
  }

  if (isProtected && sessionCookieValue) {
    const canUseTolerance = Boolean(
      (process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET) &&
      isStaffAuthTolerantTenant(tenant)
    );
    const guardResponse = await resolveProtectedRouteResponse(
      protectedRouteContext,
      sessionCookieValue,
      canUseTolerance
    );
    if (guardResponse) {
      return applyResponseHardening(guardResponse, request, tenant, securityHeaders);
    }
  }

  const response = securityHeaders.requestHeaders
    ? NextResponse.next({ request: { headers: securityHeaders.requestHeaders } })
    : NextResponse.next();

  if (isE2EDiagnosticsEnabled()) {
    response.headers.set('x-e2e-tenant', tenant ?? 'none');
    response.headers.set('x-e2e-tenant-context', tenantContext.kind);
    response.headers.set('x-e2e-host', host);
  }

  return applyResponseHardening(response, request, tenant, securityHeaders);
}
