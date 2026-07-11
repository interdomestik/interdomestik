function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
      'www-authenticate': 'Basic realm="Interdomestik Reviewer Portal"',
    },
  });
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBasicAuth(header) {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function equalText(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export default async function middleware(request) {
  if (process.env.REVIEW_PORTAL_AUTH_MODE !== 'basic') return unauthorized();
  const expectedUser = process.env.REVIEW_PORTAL_BASIC_USER || '';
  const expectedHash = process.env.REVIEW_PORTAL_BASIC_PASSWORD_HASH || '';
  const auth = decodeBasicAuth(request.headers.get('authorization') || '');
  if (!expectedUser || !expectedHash || !auth) return unauthorized();
  const suppliedHash = await sha256Hex(auth.password);
  if (!equalText(auth.user, expectedUser) || !equalText(suppliedHash, expectedHash)) {
    return unauthorized();
  }
}
