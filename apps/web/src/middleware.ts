import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // 1. Handle i18n routing
  const response = intlMiddleware(request);

  // 2. Security Headers
  // Content Security Policy
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://va.vercel-scripts.com https://cdn.paddle.com https://sandbox-cdn.paddle.com https://checkout.paddle.com https://sandbox-checkout.paddle.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://sandbox-cdn.paddle.com;
    img-src 'self' blob: data: https://*.supabase.co https://*.stripe.com https://*.paddle.com https://*.githubusercontent.com;
    font-src 'self' https://fonts.gstatic.com https://sandbox-cdn.paddle.com;
    connect-src 'self' https://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://*.paddle.com https://sandbox-buy.paddle.com https://api.novu.co https://*.novu.co wss://*.novu.co;
    frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.paddle.com https://sandbox-buy.paddle.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `
    .replace(/\s{2,}/g, ' ')
    .trim();

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 3. Optional: Optimistic Auth Check
  // Note: Full session validation happens in pages/layouts or via auth.api.getSession
  // This is just a placeholder to show where middleware logic would go.
  // const session = await auth.api.getSession({ headers: await headers() });

  return response;
}

export const config = {
  matcher: ['/', '/(sq|en|sr|mk)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
