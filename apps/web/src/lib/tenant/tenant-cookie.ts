import { TENANT_COOKIE_NAME } from '@/lib/tenant/tenant-hosts';
import type { NextRequest, NextResponse } from 'next/server';

const TENANT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function requestProtocol(request: Request | NextRequest): string {
  if ('nextUrl' in request) return request.nextUrl.protocol;
  return new URL(request.url).protocol;
}

function isHttpsRequest(request: Request | NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  return requestProtocol(request) === 'https:' || forwardedProto?.toLowerCase() === 'https';
}

export function applyTenantCookie(
  response: NextResponse,
  tenantId: string,
  request: Request | NextRequest
): NextResponse {
  response.cookies.set(TENANT_COOKIE_NAME, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttpsRequest(request),
    maxAge: TENANT_COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });

  return response;
}
