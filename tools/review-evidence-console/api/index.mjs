import { createEnvironmentPortalHandler } from '../server/runtime.mjs';
import { notFoundResponse } from '../server/http/responses.mjs';

function publicApiPath(rewrittenPath) {
  if (typeof rewrittenPath !== 'string') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rewrittenPath);
  } catch {
    return null;
  }
  const segments = decoded.split('/');
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
  const kind = request.headers.get('x-rec-rewrite-kind');
  const rewrittenPath = request.headers.get('x-rec-rewrite-path');
  const pathname = kind === 'root' ? '/api' : kind === 'path' ? publicApiPath(rewrittenPath) : null;
  if (pathname === null) return null;
  url.pathname = pathname;
  const restored = new Request(url, request);
  restored.headers.delete('x-rec-rewrite-kind');
  restored.headers.delete('x-rec-rewrite-path');
  return restored;
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
