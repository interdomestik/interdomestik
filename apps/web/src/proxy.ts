import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Proxy replaces the deprecated middleware convention in Next.js 16.
export default async function proxy(request: NextRequest) {
  // 1. Handle i18n routing
  const response = intlMiddleware(request);

  // 2. Security Headers (CSP, etc.) can be added here
  // response.headers.set('X-Frame-Options', 'DENY');

  // 3. Optional: Optimistic Auth Check
  // Note: Full session validation happens in pages/layouts or via auth.api.getSession
  // This is just a placeholder to show where middleware logic would go.
  // const session = await auth.api.getSession({ headers: await headers() });

  return response;
}

export const config = {
  matcher: ['/', '/(sq|en|sr|mk)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
