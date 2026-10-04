'use client';

/**
 * Thin reader for the login-only session endpoint.
 *
 * It sends no identity hint of its own: the endpoint derives the role and the admin verdict from
 * the session cookie it verifies. A denied or failed read is roleless, which the caller treats as
 * fail closed.
 */
const LOGIN_SESSION_PATH = '/api/auth/login-session';

export type LoginSession = { role?: string; hasAdminAccess: boolean };

function readMinimalSession(payload: unknown): LoginSession {
  const record = typeof payload === 'object' && payload !== null ? payload : null;
  const role = (record as { role?: unknown })?.role;
  const hasAdminAccess = (record as { hasAdminAccess?: unknown })?.hasAdminAccess === true;

  return typeof role === 'string' ? { role, hasAdminAccess } : { hasAdminAccess };
}

export async function readLoginSession(): Promise<LoginSession> {
  const response = await fetch(LOGIN_SESSION_PATH, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    method: 'GET',
  });

  // A limiter or provider denial carries no session to read.
  if (!response.ok) return { hasAdminAccess: false };

  return readMinimalSession(await response.json());
}
