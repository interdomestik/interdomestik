import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';

import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export default function proxy(request: NextRequest) {
  const nonce = createNonce();

  // 1. Handle i18n routing
  const response = intlMiddleware(request);

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
    ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
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
    ...(isDev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`]),
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
    )} https://vitals.vercel-insights.com https://*.paddle.com https://sandbox-buy.paddle.com https://api.novu.co https://*.novu.co wss://*.novu.co;
    frame-src 'self' https://*.paddle.com https://sandbox-buy.paddle.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  response.headers.set('Content-Security-Policy', cspHeader);

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

  return response;
}

export const config = {
  matcher: ['/', '/(sq|en|sr|mk)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
