import { isE2EDiagnosticsEnabled } from '@/lib/runtime-environment';
import { buildIdaLiveLoginRedirectUrl } from '@/lib/tenant/ida-live-login-cutover';
import { NextRequest, NextResponse } from 'next/server';
import { resolveProtectedRouteGuardResponse } from './proxy-gate';
import { resolveProxyRequestContext } from './proxy-resolve';
import { applyResponseHardening, createSecurityHeaders } from './proxy-secure';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const context = resolveProxyRequestContext(request);
  const securityHeaders = createSecurityHeaders(request);
  const idaLiveLoginRedirectUrl = buildIdaLiveLoginRedirectUrl(request.nextUrl, context.host);

  if (idaLiveLoginRedirectUrl) {
    const redirectResponse = NextResponse.redirect(idaLiveLoginRedirectUrl, 301);
    redirectResponse.headers.set('x-ida-live-login-cutover', 'country-host-redirect');
    return applyResponseHardening(redirectResponse, request, null, securityHeaders);
  }

  const guardResponse = await resolveProtectedRouteGuardResponse(request, context);
  if (guardResponse) {
    return applyResponseHardening(guardResponse, request, context.tenant, securityHeaders);
  }

  const response = securityHeaders.requestHeaders
    ? NextResponse.next({ request: { headers: securityHeaders.requestHeaders } })
    : NextResponse.next();

  if (isE2EDiagnosticsEnabled()) {
    response.headers.set('x-e2e-tenant', context.tenant ?? 'none');
    response.headers.set('x-e2e-tenant-context', context.tenantContext.kind);
    response.headers.set('x-e2e-host', context.host);
  }

  return applyResponseHardening(response, request, context.tenant, securityHeaders);
}
