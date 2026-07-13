const PRIVATE_HEADERS = Object.freeze({
  'cache-control': 'private, no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

export function jsonResponse(status, value, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...PRIVATE_HEADERS, ...headers },
  });
}

export function emptyResponse(status, headers = {}) {
  return new Response(null, {
    status,
    headers: { ...PRIVATE_HEADERS, ...headers },
  });
}

export const notFoundResponse = () => jsonResponse(404, { code: 'not_found' });
export const unauthorizedResponse = () => jsonResponse(401, { code: 'authentication_failed' });
