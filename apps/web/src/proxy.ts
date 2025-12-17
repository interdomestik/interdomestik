import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Proxy replaces the deprecated middleware convention in Next.js 16.
export const proxy = createMiddleware(routing);

export const config = {
  matcher: ['/', '/(sq|en|sr|mk)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};

export default proxy;
