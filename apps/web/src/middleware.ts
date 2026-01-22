import { NextRequest, NextResponse } from 'next/server';
import {
  coerceTenantId,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
} from './lib/tenant/tenant-hosts';
import proxy from './lib/proxy';

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
  const requestHost = getRequestHost(req);
  const hostTenant = resolveTenantFromHost(requestHost);

  // 1. Prepare Request Headers (Tenant Context)
  const requestHeaders = new Headers(req.headers);
  let resolvedTenant = hostTenant;

  if (hostTenant) {
    requestHeaders.set(TENANT_HEADER_NAME, hostTenant);
  } else {
    // Fallback resolution for neutral domain (cookie > header > query)
    const cookieTenant = coerceTenantId(req.cookies.get(TENANT_COOKIE_NAME)?.value);
    const headerTenant = coerceTenantId(req.headers.get(TENANT_HEADER_NAME) ?? undefined);
    const queryTenant = coerceTenantId(req.nextUrl.searchParams.get('tenantId'));
    resolvedTenant = cookieTenant ?? headerTenant ?? queryTenant;

    if (resolvedTenant) {
      requestHeaders.set(TENANT_HEADER_NAME, resolvedTenant);
    }
  }

  // 2. Chain to Proxy (next-intl + security) with updated headers
  const response = await proxy(
    new NextRequest(req.url, {
      ...req,
      headers: requestHeaders,
    })
  );

  // 3. Inject Cookie (Response)
  if (resolvedTenant) {
    const existingCookie = req.cookies.get(TENANT_COOKIE_NAME)?.value;
    if (existingCookie !== resolvedTenant) {
      response.cookies.set({
        name: TENANT_COOKIE_NAME,
        value: resolvedTenant,
        httpOnly: false,
        sameSite: 'lax',
        secure: req.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
  }

  // Debugging helpers for E2E
  const isE2eDebugRequest = req.headers.get('x-e2e-debug') === '1';
  const isPlaywrightRun =
    process.env.PLAYWRIGHT === '1' || process.env.INTERDOMESTIK_AUTOMATED === '1';

  if (isE2eDebugRequest || isPlaywrightRun) {
    response.headers.set('x-e2e-request-host', requestHost);
    response.headers.set('x-e2e-host-tenant', hostTenant ?? '');
    response.headers.set('x-e2e-resolved-tenant', resolvedTenant ?? '');

    response.cookies.set('e2e_request_host', requestHost);
    response.cookies.set('e2e_host_tenant', hostTenant ?? '');
    response.cookies.set('e2e_resolved_tenant', resolvedTenant ?? '');
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths EXCEPT:
    // - api (API routes) -> Critical to prevent next-intl from handling API
    // - _next (static files)
    // - _vercel (internals)
    // - files with extensions (e.g. favicon.ico)
    '/((?!api|_next|_vercel|.*\..*).*)',
    // But DO match the root and locale paths
    '/',
    '/(sq|en|sr|mk|de|hr)/:path*',
  ],
};
