export function requestOrigin(request) {
  const url = new URL(request.url);
  return url.origin;
}

export function hasValidMutationOrigin(request) {
  const supplied = request.headers.get('origin');
  return typeof supplied === 'string' && supplied === requestOrigin(request);
}
