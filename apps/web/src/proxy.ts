import type { NextRequest } from 'next/server';
import { proxy as proxyLogic } from './lib/proxy-logic';

export function proxy(request: NextRequest) {
  return proxyLogic(request);
}

export const config = {
  matcher: ['/', '/(sq|en|sr|mk|de|hr)/:path*', '/((?!api|_next|_vercel|.*\\..*).*)'],
};
