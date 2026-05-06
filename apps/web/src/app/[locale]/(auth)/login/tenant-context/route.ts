import { applyTenantCookie } from '@/lib/tenant/tenant-cookie';
import { coerceTenantId } from '@/lib/tenant/tenant-hosts';
import { NextResponse } from 'next/server';

function sanitizeNextPath(nextPath: string | null, locale: string): string {
  const fallback = `/${locale}/login`;
  if (!nextPath) return fallback;
  if (!nextPath.startsWith('/')) return fallback;
  if (nextPath.startsWith('//')) return fallback;
  if (!nextPath.startsWith(`/${locale}/login`)) return fallback;
  return nextPath;
}

function redirectOriginForRequest(url: URL, request: Request): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedProto?.toLowerCase() !== 'https' || url.protocol === 'https:') {
    return url.origin;
  }

  const externalUrl = new URL(url);
  externalUrl.protocol = 'https:';
  return externalUrl.origin;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ locale: string }> }
): Promise<Response> {
  const { locale } = await params;
  const url = new URL(request.url);
  const tenantId = coerceTenantId(url.searchParams.get('tenantId') ?? undefined);
  const redirectPath = sanitizeNextPath(url.searchParams.get('next'), locale);
  const redirectUrl = new URL(redirectPath, redirectOriginForRequest(url, request));

  const response = NextResponse.redirect(redirectUrl);
  if (!tenantId) return response;

  return applyTenantCookie(response, tenantId, request);
}
