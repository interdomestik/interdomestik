import { createEnvironmentPortalHandler } from '../server/runtime.mjs';
import { notFoundResponse } from '../server/http/responses.mjs';

function publicApiPath(rewrittenPath) {
  const segments = rewrittenPath.split('/');
  if (
    segments.some(
      segment => !segment || segment === '.' || segment === '..' || segment.includes('\\')
    )
  ) {
    return null;
  }
  return `/api/${segments.map(encodeURIComponent).join('/')}`;
}

function restorePublicRequest(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/index') return request;
  const isRoot = url.searchParams.has('__rec_root');
  const rewrittenPath = url.searchParams.get('__rec_path');
  if (!isRoot && rewrittenPath === null) return request;
  url.searchParams.delete('__rec_root');
  url.searchParams.delete('__rec_path');
  const pathname = rewrittenPath === null ? '/api' : publicApiPath(rewrittenPath);
  if (pathname === null) return null;
  url.pathname = pathname;
  return new Request(url, request);
}

export function createVercelApiFunction({ handler }) {
  if (typeof handler !== 'function') throw new TypeError('Handler is required.');
  return Object.freeze({
    fetch: request => {
      const restored = restorePublicRequest(request);
      return restored === null ? notFoundResponse() : handler(restored);
    },
  });
}

const handler = createEnvironmentPortalHandler(undefined, event =>
  console.info(JSON.stringify(event))
);

export default createVercelApiFunction({ handler });
