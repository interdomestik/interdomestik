import { NextRequest } from 'next/server';

const SESSION_COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  '__Host-better-auth.session_token',
] as const;
const ACTIVE_SESSION_CACHE_TTL_MS = 2000;
const ACTIVE_SESSION_CACHE_MAX_ENTRIES = 100;
const activeSessionCache = new Map<string, number>();

export type SessionIntrospectionObservation = {
  state: 'active' | 'inactive' | 'unknown';
  throttled: boolean;
};

export function getSessionCookieValue(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value;
    if (value) return value;
  }
  return null;
}

export async function getActiveSessionCacheKey(
  request: NextRequest,
  sessionCookieValue: string
): Promise<string> {
  const host = request.headers.get('host') ?? '';
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(sessionCookieValue));
  const sessionHash = Array.from(new Uint8Array(digest), value =>
    value.toString(16).padStart(2, '0')
  ).join('');
  return `${host}::${sessionHash}`;
}

export function rememberActiveSession(cacheKey: string): void {
  const now = Date.now();
  for (const [key, expiresAt] of activeSessionCache.entries()) {
    if (expiresAt <= now) activeSessionCache.delete(key);
  }
  while (activeSessionCache.size >= ACTIVE_SESSION_CACHE_MAX_ENTRIES) {
    const oldestKey = activeSessionCache.keys().next().value;
    if (!oldestKey) break;
    activeSessionCache.delete(oldestKey);
  }
  activeSessionCache.set(cacheKey, now + ACTIVE_SESSION_CACHE_TTL_MS);
}

export function hasRecentActiveSession(cacheKey: string): boolean {
  const expiresAt = activeSessionCache.get(cacheKey);
  if (!expiresAt) return false;
  if (expiresAt > Date.now()) return true;
  activeSessionCache.delete(cacheKey);
  return false;
}

function base64UrlToBytes(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return Uint8Array.from(atob(padded), char => char.codePointAt(0) ?? 0);
  } catch {
    return null;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function isSignedSessionCookieValid(
  signedValue: string,
  secret: string
): Promise<boolean> {
  const decodedValue = safeDecodeURIComponent(signedValue);
  const separatorIndex = decodedValue.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === decodedValue.length - 1) return false;

  const signatureBytes = base64UrlToBytes(decodedValue.slice(separatorIndex + 1));
  if (!signatureBytes) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes as unknown as BufferSource,
    encoder.encode(decodedValue.slice(0, separatorIndex))
  );
}

function isActiveSessionPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const session = (payload as { session?: { expiresAt?: unknown } }).session;
  if (!session || typeof session !== 'object' || !session.expiresAt) return false;
  const rawExpiresAt = session.expiresAt;
  let expiresAt = Number.NaN;
  if (rawExpiresAt instanceof Date) expiresAt = rawExpiresAt.getTime();
  if (typeof rawExpiresAt === 'number') expiresAt = rawExpiresAt;
  if (typeof rawExpiresAt === 'string') expiresAt = Date.parse(rawExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function introspectSessionState(
  request: NextRequest
): Promise<SessionIntrospectionObservation> {
  try {
    const url = request.nextUrl.clone();
    url.pathname = '/api/auth/get-session';
    url.search = '?disableCookieCache=true&disableRefresh=true';
    const cookieHeader = request.headers.get('cookie');
    if (!cookieHeader) return { state: 'inactive', throttled: false };

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (response.status === 429) return { state: 'unknown', throttled: true };
    if (response.status >= 400 && response.status < 500) {
      return { state: 'inactive', throttled: false };
    }
    if (!response.ok) return { state: 'unknown', throttled: true };

    return {
      state: isActiveSessionPayload(await response.json()) ? 'active' : 'inactive',
      throttled: false,
    };
  } catch {
    return { state: 'unknown', throttled: true };
  }
}
