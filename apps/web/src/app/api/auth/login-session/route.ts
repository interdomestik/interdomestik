import { requireTenantAdminOrBranchManagerSession } from '@interdomestik/domain-users/admin/access';
import type { UserSession } from '@interdomestik/domain-users/types';

import { isAdmin } from '@/lib/roles.core';
import { GET as getProviderSession } from '../[...all]/route';

/**
 * Minimal login-only session read.
 *
 * The browser used to call `GET /api/auth/get-session` directly and then a separate admin check.
 * This endpoint keeps that single provider read, with both of its rate-limit pipelines, by invoking
 * the unchanged catch-all GET exactly once on a canonical request: the application limiter runs in
 * that route, and the provider's own per-path/IP router limiter runs inside its handler. Only the
 * role and the primary-admin verdict derived from that same verified session are returned.
 */
const CANONICAL_SESSION_PATH = '/api/auth/get-session';

/**
 * Headers that describe the provider's own body. A success body is replaced by the minimal login
 * payload, so keeping these would misdescribe or revalidate the wrong representation.
 */
const STALE_REPRESENTATION_HEADERS = [
  'content-digest',
  'content-encoding',
  'content-length',
  'content-range',
  'content-type',
  'digest',
  'etag',
  'last-modified',
];

export type LoginSessionResponse = { role?: string; hasAdminAccess: boolean };

/** Builds the canonical provider request: same origin, headers and abort signal, no caller query. */
function toCanonicalSessionRequest(request: Request): Request {
  const canonical = new URL(request.url);
  canonical.pathname = CANONICAL_SESSION_PATH;
  canonical.search = '';
  canonical.hash = '';

  return new Request(canonical.toString(), {
    headers: request.headers,
    method: 'GET',
    signal: request.signal,
  });
}

function readSessionUser(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const user = (payload as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) return null;

  return user as Record<string, unknown>;
}

/** Derives the role and the unchanged primary-admin verdict from the verified session only. */
async function resolveLoginSession(payload: unknown): Promise<LoginSessionResponse> {
  const user = readSessionUser(payload);
  const role = typeof user?.role === 'string' ? user.role : undefined;

  if (!user || !isAdmin(role)) {
    return role === undefined ? { hasAdminAccess: false } : { role, hasAdminAccess: false };
  }

  try {
    await requireTenantAdminOrBranchManagerSession({ user } as unknown as UserSession);
    return { role, hasAdminAccess: true };
  } catch {
    return { role, hasAdminAccess: false };
  }
}

/** Keeps every provider cookie and cache directive while dropping its body description. */
function buildSuccessHeaders(provider: Headers): Headers {
  const headers = new Headers();
  for (const [name, value] of provider.entries()) {
    if (name === 'set-cookie' || STALE_REPRESENTATION_HEADERS.includes(name)) continue;
    headers.append(name, value);
  }

  const cookies = typeof provider.getSetCookie === 'function' ? provider.getSetCookie() : [];
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }
  if (cookies.length === 0) {
    // A runtime without `getSetCookie` exposes only the combined value; keep it rather than drop it.
    const combined = provider.get('set-cookie');
    if (combined) headers.append('set-cookie', combined);
  }
  headers.set('content-type', 'application/json; charset=utf-8');

  return headers;
}

export async function GET(request: Request): Promise<Response> {
  const response = await getProviderSession(toCanonicalSessionRequest(request));
  // Every denial, including both limiters' 429/503, is the provider's own answer: forward it whole
  // and never read a session or an admin verdict out of it.
  if (!response.ok) return response;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A success body that cannot be read establishes no session and therefore grants nothing.
    payload = null;
  }

  return new Response(JSON.stringify(await resolveLoginSession(payload)), {
    headers: buildSuccessHeaders(response.headers),
    status: response.status,
    statusText: response.statusText,
  });
}
