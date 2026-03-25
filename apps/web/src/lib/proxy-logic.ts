import { routing } from '@/i18n/routing';
import { emitAuthTelemetryEvent } from '@/lib/auth-telemetry';
import { isStaffAuthTolerantTenant } from '@/lib/feature-flags';
import {
  resolveTenantFromHost as resolveTenantFromCanonicalHost,
  TENANT_COOKIE_NAME,
} from '@/lib/tenant/tenant-hosts';
import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_TOP_LEVEL = new Set(['member', 'admin', 'staff', 'agent']);
const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Host-better-auth.session_token',
] as const;

function resolveTenantFromHost(
  host: string
): 'tenant_mk' | 'tenant_ks' | 'tenant_al' | 'pilot-mk' | null {
  const canonicalTenant = resolveTenantFromCanonicalHost(host);
  if (canonicalTenant) return canonicalTenant;

  const raw = host.split(':')[0].toLowerCase();
  if (raw.startsWith('pilot.')) return 'pilot-mk';
  if (raw.includes('pilot.127.0.0.1.nip.io')) return 'pilot-mk';

  return null;
}

function getSessionCookieValue(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return value;
  }
  return null;
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

  const firstIntrospection = await introspectSessionState(context.request);
  if (firstIntrospection.state === 'active') {
    return null;
  }

  if (firstIntrospection.state === 'unknown') {
    if (firstIntrospection.throttled) {
      emitThrottledSessionTelemetry(context);
    }
    return null;
  }

  if (!canUseTolerance) {
    return redirectProtectedRouteToLogin(context, 'inactive_session');
  }

  const retryIntrospection = await introspectSessionState(context.request);
  if (retryIntrospection.state === 'active') {
    return null;
  }

  if (retryIntrospection.state === 'unknown') {
    if (retryIntrospection.throttled) {
      emitThrottledSessionTelemetry(context);
    }
    return null;
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
  const tenant = resolveTenantFromHost(host);

  // 1. Force nip.io in Dev (Optional, if env var set)
  // Logic simplified/removed to prevent loops - rely on manual access for now
  // or user-provided "Force Redirect" if absolutely needed.
  // Given "restart loop" history, we are being conservative.

  // 2. Auth Guard (Edge Safe)
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
    return redirectProtectedRouteToLogin(protectedRouteContext, 'missing_cookie');
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
      return guardResponse;
    }
  }

  // 3. Tenant Resolution
  const response = NextResponse.next();

  // Attach Debug Headers
  response.headers.set('x-e2e-tenant', tenant ?? 'none');
  response.headers.set('x-e2e-host', host);

  if (tenant) {
    response.cookies.set(TENANT_COOKIE_NAME, tenant);
  }

  // CSP Config could go here, but for "Pure Logic" we might skip heavy headers initially.
  // Adding minimal security headers.
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}
