import { routing } from '@/i18n/routing';
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

async function hasIntrospectedActiveSession(request: NextRequest): Promise<boolean> {
  try {
    const url = request.nextUrl.clone();
    url.pathname = '/api/auth/get-session';
    url.search = '?disableCookieCache=true&disableRefresh=true';

    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return false;

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        cookie: cookieHeader,
      },
      cache: 'no-store',
    });

    if (!response.ok) return false;

    const payload = await response.json();
    return isActiveSessionPayload(payload);
  } catch {
    return false;
  }
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

  const isProtected = PROTECTED_TOP_LEVEL.has(topLevel);
  const sessionCookieValue = isProtected ? getSessionCookieValue(request) : null;

  if (isProtected && !sessionCookieValue) {
    return redirectToLogin(request, isLocale, possibleLocale);
  }

  if (isProtected && sessionCookieValue) {
    const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
    if (secret) {
      const isSignedCookieValid = await isSignedSessionCookieValid(sessionCookieValue, secret);
      if (!isSignedCookieValid) {
        return redirectToLogin(request, isLocale, possibleLocale);
      }
    }

    const isActiveSession = await hasIntrospectedActiveSession(request);
    if (!isActiveSession) {
      return redirectToLogin(request, isLocale, possibleLocale);
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
