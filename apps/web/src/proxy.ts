import { Logger } from 'next-axiom';
import createIntlRouter from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';

const handleIntlRouting = createIntlRouter(routing);

const PROTECTED_TOP_LEVEL = new Set(['member', 'admin', 'staff', 'agent']);
const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Host-better-auth.session_token',
] as const;

function getRequestOriginFromHeaders(request: NextRequest): string | null {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const proto = forwardedProto ?? request.nextUrl.protocol.replace(/:$/, '');

  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');
  if (!host) return null;

  return `${proto}://${host}`;
}

function createAbsoluteUrl(request: NextRequest, pathname: string): URL {
  const origin = getRequestOriginFromHeaders(request) ?? request.nextUrl.origin;
  return new URL(pathname, origin);
}

function normalizeRequestForRouting(request: NextRequest): NextRequest {
  // Avoid re-creating requests with bodies (stream can only be read once).
  if (request.method !== 'GET' && request.method !== 'HEAD') return request;

  const origin = getRequestOriginFromHeaders(request);
  if (!origin) return request;

  const normalizedUrl = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, origin);
  return new NextRequest(normalizedUrl, {
    headers: request.headers,
    method: request.method,
  });
}

function getLocaleAndTopLevelPath(pathname: string): {
  locale: string | null;
  topLevel: string | null;
} {
  const re = /^\/([a-z]{2})(?:\/([^/]+))?(?:\/|$)/i;
  const match = re.exec(pathname);
  if (!match) return { locale: null, topLevel: null };
  return { locale: match[1] ?? null, topLevel: match[2] ?? null };
}

function hasSessionCookie(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return true;
  }
  return false;
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCodePoint(...bytes));
}

export default async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const pathname = request.nextUrl.pathname;

  // In Next standalone (used by Playwright), the internally initialized request.url/origin can
  // default to localhost/127.0.0.1 even when Host is mk.localhost/ks.localhost. Normalize
  // routing/redirects to the incoming host so we never drift origins.
  const routingRequest = normalizeRequestForRouting(request);

  // Axiom structured logging
  const logger = new Logger({ source: 'proxy', req: request });
  logger.info('Request', {
    path: pathname,
    method: request.method,
  });

  // 0. Pre-render auth guard (Golden Path)
  // IMPORTANT: Must run before any React rendering and must not hit the DB.
  // We intentionally only check presence of the Better Auth session cookie.
  const { locale, topLevel } = getLocaleAndTopLevelPath(pathname);
  const isProtected = Boolean(locale && topLevel && PROTECTED_TOP_LEVEL.has(topLevel));
  if (isProtected && !hasSessionCookie(request)) {
    const loginUrl = createAbsoluteUrl(request, `/${locale}/login`);
    const response = NextResponse.redirect(loginUrl, 307);
    response.headers.set('x-auth-guard', 'middleware');
    // Flush Axiom logs before returning
    await logger.flush();
    return response;
  }

  // 1. Handle i18n routing
  // Some routes intentionally live outside locale-prefixed routing.
  // Example: `/track/:token` uses `?lang=` and must not be redirected to `/<locale>/...`.
  const isLocaleAgnosticRoute = pathname.startsWith('/track/');
  const response = isLocaleAgnosticRoute ? NextResponse.next() : handleIntlRouting(routingRequest);

  if (isProtected) {
    response.headers.set('x-auth-guard', 'middleware');
  }

  // 2. Security Headers
  // Content Security Policy
  const supabaseConnectSrc: string[] = [];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const supabaseOrigin = new URL(supabaseUrl).origin;
      supabaseConnectSrc.push(supabaseOrigin);
      if (supabaseOrigin.startsWith('http://')) {
        supabaseConnectSrc.push(supabaseOrigin.replace(/^http:/, 'ws:'));
      } else if (supabaseOrigin.startsWith('https://')) {
        supabaseConnectSrc.push(supabaseOrigin.replace(/^https:/, 'wss:'));
      }
    } catch {
      // Ignore invalid SUPABASE URLs; CSP will fall back to defaults.
    }
  }

  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'", 'http://localhost:8097'] : []),
    'https://va.vercel-scripts.com',
    'https://www.googletagmanager.com',
    'https://connect.facebook.net',
    'https://cdn.paddle.com',
    'https://sandbox-cdn.paddle.com',
    'https://checkout.paddle.com',
    'https://sandbox-checkout.paddle.com',
  ];
  const styleSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(isDev ? ["'unsafe-inline'"] : []),
    'https://fonts.googleapis.com',
    'https://sandbox-cdn.paddle.com',
  ];
  const styleElemSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com',
    'https://sandbox-cdn.paddle.com',
  ];
  const styleAttrSrc = ["'unsafe-inline'"];

  const cspHeader = `
    default-src 'self';
    script-src ${scriptSrc.join(' ')};
    style-src ${styleSrc.join(' ')};
    style-src-elem ${styleElemSrc.join(' ')};
    style-src-attr ${styleAttrSrc.join(' ')};
    img-src 'self' blob: data: https://*.supabase.co https://*.paddle.com https://*.githubusercontent.com;
    font-src 'self' https://fonts.gstatic.com https://sandbox-cdn.paddle.com;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co ${supabaseConnectSrc.join(
      ' '
    )} https://vitals.vercel-insights.com https://*.paddle.com https://sandbox-buy.paddle.com https://api.novu.co https://*.novu.co wss://*.novu.co https://api.openai.com https://api.resend.com;
    frame-src 'self' https://*.paddle.com https://sandbox-buy.paddle.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `
    .replaceAll(/\s{2,}/g, ' ')
    .trim();

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-DNS-Prefetch-Control', 'on');

  const forwardedProto = request.headers.get('x-forwarded-proto');
  const isSecureRequest = request.nextUrl.protocol === 'https:' || forwardedProto === 'https';
  if (process.env.NODE_ENV === 'production' || isSecureRequest) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }

  // Forward the nonce upstream (used by RootLayout to nonce inline scripts).
  response.headers.set('x-middleware-request-x-nonce', nonce);
  const overrideHeaders = response.headers.get('x-middleware-override-headers');
  response.headers.set(
    'x-middleware-override-headers',
    overrideHeaders ? `${overrideHeaders},x-nonce` : 'x-nonce'
  );

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');

  // Flush Axiom logs before returning
  await logger.flush();

  return response;
}

export const config = {
  matcher: ['/', '/(sq|en|sr|mk|de|hr)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
