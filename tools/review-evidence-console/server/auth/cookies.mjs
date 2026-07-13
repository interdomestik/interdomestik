const NAME = 'review_portal_session';
const ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict';

export function sessionCookie(token, maxAge = 28_800) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_.-]+$/u.test(token)) throw new TypeError();
  if (!Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > 28_800) throw new TypeError();
  return `${NAME}=${token}; ${ATTRIBUTES}; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${NAME}=; ${ATTRIBUTES}; Max-Age=0`;
}

export function readSessionCookie(header) {
  if (typeof header !== 'string') return null;
  for (const pair of header.split(';')) {
    const [name, ...parts] = pair.trim().split('=');
    if (name === NAME) return parts.join('=') || null;
  }
  return null;
}
