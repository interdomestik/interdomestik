import { Logger } from 'next-axiom';
import createMiddleware from 'next-intl/middleware';
import { NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);

export default async function middleware(request: NextRequest) {
  const logger = new Logger({ source: 'middleware', req: request });

  // Log the request
  logger.info('Middleware Request', {
    path: request.nextUrl.pathname,
    method: request.method,
  });

  const response = handleI18n(request);

  // You can also attach headers or log response status here if needed

  await logger.flush();
  return response;
}

export const config = {
  matcher: ['/', '/(sq|mk|en|sr)/:path*'],
};
