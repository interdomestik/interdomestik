import { TENANT_COOKIE_NAME, coerceTenantId } from '@/lib/tenant/tenant-hosts';
import { NextResponse } from 'next/server';

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

function sanitizeNextPath(nextPath: string | null, locale: string): string {
  const fallback = `/${locale}/login`;
  if (!nextPath) return fallback;
  if (!nextPath.startsWith('/')) return fallback;
  if (nextPath.startsWith('//')) return fallback;
  if (!nextPath.startsWith(`/${locale}/login`)) return fallback;
  return nextPath;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
): Promise<Response> {
  const { locale } = await params;
  const url = new URL(request.url);
  const tenantId = coerceTenantId(url.searchParams.get('tenantId') ?? undefined);
  const redirectPath = sanitizeNextPath(url.searchParams.get('next'), locale);
  const redirectUrl = new URL(redirectPath, url.origin);

  const response = NextResponse.redirect(redirectUrl);
  if (!tenantId) return response;

  response.cookies.set(TENANT_COOKIE_NAME, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookie(),
    path: '/',
  });
  return response;
}
