import { createEnvironmentPortalHandler } from './server/runtime.mjs';

export const config = Object.freeze({ runtime: 'nodejs', matcher: '/api/:path*' });

export function createMiddleware({ handler }) {
  return async request => {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return undefined;
    return handler(request);
  };
}

const middleware = createMiddleware({
  handler: createEnvironmentPortalHandler(undefined, event => console.info(JSON.stringify(event))),
});

export default middleware;
