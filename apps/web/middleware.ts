import type { NextRequest } from 'next/server';
import {
  coerceTenantId,
  resolveTenantFromHost,
  TENANT_COOKIE_NAME,
  type TenantId,
} from './src/lib/tenant/tenant-hosts';
import proxy from './src/proxy';

function getRequestHost(req: NextRequest): string {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
}

function tenantFromLocalePath(pathname: string): TenantId | null {
  const seg = pathname.split('/')[1]?.toLowerCase();
  if (seg === 'mk') return 'tenant_mk';
  if (seg === 'sq') return 'tenant_ks';
  return null;
}

export default async function middleware(req: NextRequest) {
  const response = await proxy(req);

  const hostTenant = resolveTenantFromHost(getRequestHost(req));
  const cookieTenant = coerceTenantId(req.cookies.get(TENANT_COOKIE_NAME)?.value);
  const queryTenant = coerceTenantId(req.nextUrl.searchParams.get('tenantId'));
  const localeTenant = tenantFromLocalePath(req.nextUrl.pathname);

  // Keep priority aligned with the documented contract.
  const resolvedTenant = hostTenant ?? cookieTenant ?? queryTenant ?? localeTenant;

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
