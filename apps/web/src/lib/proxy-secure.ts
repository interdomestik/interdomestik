import { isProductionDeployment } from '@/lib/runtime-environment';
import {
  buildReportOnlyCsp,
  buildReportToHeader,
  generateCspNonce,
  isCspNonceActive,
} from '@/lib/security/csp-nonce';
import { applyTenantCookie } from '@/lib/tenant/tenant-cookie';
import { NextRequest, NextResponse } from 'next/server';

export type SecurityHeaders = {
  requestHeaders?: Headers;
  responseHeaders: Headers;
};

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();

  return request.nextUrl.protocol === 'https:' || forwardedProto?.toLowerCase() === 'https';
}

function compactHeader(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim();
}

function buildContentSecurityPolicy(request: NextRequest): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://www.google-analytics.com https://cdn.paddle.com https://*.paddle.com ${isDevelopment ? "'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://www.facebook.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://api.paddle.com https://*.paddle.com https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://connect.facebook.net https://graph.facebook.com",
    "frame-src 'self' https://*.paddle.com https://buy.paddle.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    isProductionDeployment() && isHttpsRequest(request) ? 'upgrade-insecure-requests' : '',
  ].filter(Boolean);

  return compactHeader(directives.join('; '));
}

export function createSecurityHeaders(request: NextRequest): SecurityHeaders {
  const csp = buildContentSecurityPolicy(request);
  const responseHeaders = new Headers();
  const isProductionHttps = isProductionDeployment() && isHttpsRequest(request);

  responseHeaders.set('Content-Security-Policy', csp);
  responseHeaders.set('X-Frame-Options', 'DENY');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  responseHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  responseHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  let requestHeaders: Headers | undefined;
  if (isCspNonceActive()) {
    const nonce = generateCspNonce();
    const reportOnlyCsp = buildReportOnlyCsp({ nonce, isProductionHttps });

    requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', reportOnlyCsp);
    requestHeaders.set('Content-Security-Policy-Report-Only', reportOnlyCsp);

    responseHeaders.set('Content-Security-Policy-Report-Only', reportOnlyCsp);
    responseHeaders.set('Report-To', buildReportToHeader());
    responseHeaders.set('x-nonce', nonce);
  }

  if (isProductionHttps) {
    responseHeaders.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  return { requestHeaders, responseHeaders };
}

export function applyResponseHardening(
  response: NextResponse,
  request: NextRequest,
  tenant: string | null,
  securityHeaders: SecurityHeaders
): NextResponse {
  for (const [name, value] of securityHeaders.responseHeaders.entries()) {
    response.headers.set(name, value);
  }

  if (tenant) {
    applyTenantCookie(response, tenant, request);
  }

  return response;
}
