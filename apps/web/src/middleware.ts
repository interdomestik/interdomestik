import proxy from './lib/proxy';

export default proxy;

export const config = {
  matcher: [
    // Match all paths EXCEPT:
    // - api (API routes) -> Critical to prevent next-intl from handling API
    // - _next (static files)
    // - _vercel (internals)
    // - files with extensions (e.g. favicon.ico)
    '/((?!api|_next|_vercel|.*\\..*).*)',
    // But DO match the root and locale paths
    '/',
    '/(sq|en|sr|mk|de|hr)/:path*',
  ],
};
