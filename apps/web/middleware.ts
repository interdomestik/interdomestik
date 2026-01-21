import type { NextRequest } from 'next/server';
import {
  coerceTenantId,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
} from './src/lib/tenant/tenant-hosts';
import proxy from './src/proxy';

function getRequestHost(req: NextRequest): string {
  const headerHost = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (headerHost) return headerHost;

  // Fallbacks for environments where NextRequest headers may be incomplete
  // (e.g. Next standalone + Playwright webServer).
  const nextUrlHost = req.nextUrl.host;
  if (nextUrlHost) return nextUrlHost;

  try {
    const urlHost = new URL(req.url).host;
    if (urlHost) return urlHost;
  } catch {
    // ignore
  }

  return '';
}

export default async function middleware(req: NextRequest) {
  const response = await proxy(req);

  const forwardedProto = req.headers.get('x-forwarded-proto');
  const isSecureRequest = req.nextUrl.protocol === 'https:' || forwardedProto === 'https';

  const requestHost = getRequestHost(req);
  const hostTenant = resolveTenantFromHost(requestHost);
  const cookieTenant = coerceTenantId(req.cookies.get(TENANT_COOKIE_NAME)?.value);
  const headerTenant = coerceTenantId(req.headers.get(TENANT_HEADER_NAME) ?? undefined);
  const queryTenant = coerceTenantId(req.nextUrl.searchParams.get('tenantId'));

  // Keep priority aligned with the documented contract.
  // IMPORTANT: Locale is language-only; tenant must never be inferred from locale.
  const resolvedTenant = hostTenant ?? cookieTenant ?? headerTenant ?? queryTenant;

  const isE2eDebugRequest = req.headers.get('x-e2e-debug') === '1';
  const isPlaywrightRun =
    process.env.PLAYWRIGHT === '1' || process.env.INTERDOMESTIK_AUTOMATED === '1';

  if (isE2eDebugRequest || isPlaywrightRun) {
    response.headers.set('x-e2e-req-url', req.url);
    response.headers.set('x-e2e-nexturl-origin', req.nextUrl.origin);
    response.headers.set('x-e2e-nexturl-host', req.nextUrl.host);
    response.headers.set('x-e2e-request-host', requestHost);
    response.headers.set('x-e2e-raw-host', req.headers.get('host') ?? '');
    response.headers.set('x-e2e-forwarded-host', req.headers.get('x-forwarded-host') ?? '');
    response.headers.set('x-e2e-host-tenant', hostTenant ?? '');
    response.headers.set('x-e2e-cookie-tenant', cookieTenant ?? '');
    response.headers.set('x-e2e-header-tenant', headerTenant ?? '');
    response.headers.set('x-e2e-query-tenant', queryTenant ?? '');
    response.headers.set('x-e2e-resolved-tenant', resolvedTenant ?? '');

    // Debug cookies are more reliable than response headers when redirects occur.
    // These are short-lived and only set when explicitly requested by the client.
    const debugCookies = [
      { name: 'e2e_raw_host', value: req.headers.get('host') ?? '' },
      { name: 'e2e_forwarded_host', value: req.headers.get('x-forwarded-host') ?? '' },
      { name: 'e2e_nexturl_host', value: req.nextUrl.host },
      { name: 'e2e_request_host', value: requestHost },
      { name: 'e2e_host_tenant', value: hostTenant ?? '' },
      { name: 'e2e_resolved_tenant', value: resolvedTenant ?? '' },
    ];

    for (const c of debugCookies) {
      response.cookies.set({
        name: c.name,
        value: c.value || '-',
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureRequest,
        path: '/',
        maxAge: 60,
      });
    }
  }

  if (resolvedTenant) {
    const existingCookie = req.cookies.get(TENANT_COOKIE_NAME)?.value;
    if (existingCookie !== resolvedTenant) {
      response.cookies.set({
        name: TENANT_COOKIE_NAME,
        value: resolvedTenant,
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecureRequest,
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and common static assets.
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
