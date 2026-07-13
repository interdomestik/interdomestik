import { createEnvironmentPortalHandler } from '../server/runtime.mjs';

function restorePublicRequest(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/index') return request;
  const isRoot = url.searchParams.has('__rec_root');
  const rewrittenPath = url.searchParams.get('__rec_path');
  if (!isRoot && rewrittenPath === null) return request;
  url.searchParams.delete('__rec_root');
  url.searchParams.delete('__rec_path');
  url.pathname = rewrittenPath === null ? '/api' : `/api/${rewrittenPath}`;
  return new Request(url, request);
}

export function createVercelApiFunction({ handler }) {
  if (typeof handler !== 'function') throw new TypeError('Handler is required.');
  return Object.freeze({ fetch: request => handler(restorePublicRequest(request)) });
}

const handler = createEnvironmentPortalHandler(undefined, event =>
  console.info(JSON.stringify(event))
);

export default createVercelApiFunction({ handler });
