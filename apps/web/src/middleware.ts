import type { NextRequest } from 'next/server';
import { proxy } from './lib/proxy-logic';

export function middleware(request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: ['/', '/(sq|en|sr|mk|de|hr)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
