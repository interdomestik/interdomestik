import type { NextRequest } from 'next/server';
import {
  coerceTenantId,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
} from './src/lib/tenant/tenant-hosts';
import proxy from './src/proxy';

function getRequestHost(req: NextRequest): string {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
}

export default async function middleware(req: NextRequest) {
  const response = await proxy(req);

  const hostTenant = resolveTenantFromHost(getRequestHost(req));
  const queryTenant = coerceTenantId(req.nextUrl.searchParams.get('tenantId'));
  const resolvedTenant = hostTenant ?? queryTenant;

  if (resolvedTenant) {
    const existingCookie = req.cookies.get(TENANT_COOKIE_NAME)?.value;
    if (existingCookie !== resolvedTenant) {
      response.cookies.set({
        name: TENANT_COOKIE_NAME,
        value: resolvedTenant,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
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
