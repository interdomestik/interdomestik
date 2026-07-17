const BETTER_AUTH_SESSION_COOKIE_NAMES = new Set([
  'better-auth.session_token',
  'better-auth.session_data',
  'better-auth.dont_remember',
]);

function setCookieValues(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.() ?? [];
  if (values.length > 0) return values;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function normalizedCookieName(value: string): string {
  return (
    value
      .split('=', 1)[0]
      ?.trim()
      .toLowerCase()
      .replace(/^__(secure|host)-/, '') ?? ''
  );
}

function isBetterAuthSessionCookie(value: string): boolean {
  return BETTER_AUTH_SESSION_COOKIE_NAMES.has(normalizedCookieName(value));
}

export function cookieHeaderFromSetCookie(headers: Headers): string | null {
  const cookies = setCookieValues(headers)
    .filter(isBetterAuthSessionCookie)
    .map(value => value.split(';', 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
  return cookies.length > 0 ? cookies.join('; ') : null;
}

export function stripBetterAuthSessionCookies(headers: Headers): Headers {
  const stripped = new Headers(headers);
  stripped.delete('set-cookie');
  for (const value of setCookieValues(headers)) {
    if (!isBetterAuthSessionCookie(value)) stripped.append('set-cookie', value);
  }
  return stripped;
}

export function accountStop(headers: Headers): Response {
  const safeHeaders = stripBetterAuthSessionCookies(headers);
  safeHeaders.delete('content-length');
  safeHeaders.delete('content-type');
  return Response.json(
    { code: 'ACCOUNT_STOP', message: 'Unable to continue' },
    { status: 409, headers: safeHeaders }
  );
}
