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

function resolveTenantFromHost(host: string): 'tenant_mk' | 'tenant_ks' | 'pilot-mk' | null {
  const canonicalTenant = resolveTenantFromCanonicalHost(host);
  if (canonicalTenant) return canonicalTenant;

  const raw = host.split(':')[0].toLowerCase();
  if (raw.startsWith('pilot.')) return 'pilot-mk';
  if (raw.includes('pilot.127.0.0.1.nip.io')) return 'pilot-mk';

  return null;
}

function hasSessionCookie(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    if (request.cookies.has(name)) return true;
  }
  return false;
}

export function proxy(request: NextRequest): NextResponse {
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
  const hasSession = hasSessionCookie(request);

  if (isProtected && !hasSession) {
    // Redirect to login
    const locale = isLocale ? possibleLocale : 'sq'; // Fallback to sq if untracked
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    const res = NextResponse.redirect(url);
    res.headers.set('x-auth-guard', 'middleware-redirect');
    return res;
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
