import { hostedAuthHosts, isHostedDeployment } from '@/lib/auth/deployment-hosts';
import { getTrustedOrigins } from '@/lib/auth/utils';

/**
 * The public reset request may name where the emailed link ends. It accepts only a path or an
 * origin this deployment trusts for sign-in (SEC-11): a foreign host would receive a valid token.
 */
export type PasswordResetTargetDecision =
  { allowed: true; target: string | null } | { allowed: false };

const MAX_TARGET_CHARS = 256;

function hasUnsafeCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f\\]/u.test(value);
}

function boundedTarget(value: string): string {
  return value.slice(0, MAX_TARGET_CHARS);
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Origins a reset target may name. A hosted deployment allows exactly its environment's sign-in
 * hosts. A local or E2E server, whose request URL can carry its listening address instead of the
 * browser's host, also allows its configured trusted origins and the request's Host authority.
 */
export function passwordResetTargetOrigins(requestUrl: string, headers: Headers): string[] {
  if (isHostedDeployment()) return hostedAuthHosts().map(host => `https://${host}`);
  const origins = new Set<string>();
  for (const origin of getTrustedOrigins() ?? []) {
    const normalized = originOf(origin);
    if (normalized) origins.add(normalized);
  }
  const requestOrigin = originOf(requestUrl);
  if (requestOrigin) {
    origins.add(requestOrigin);
    const host = headers.get('host');
    const hostOrigin = host ? originOf(`${new URL(requestOrigin).protocol}//${host}`) : null;
    if (hostOrigin) origins.add(hostOrigin);
  }
  return [...origins];
}

export function evaluatePasswordResetTarget(
  body: unknown,
  allowedOrigins: readonly string[]
): PasswordResetTargetDecision {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { allowed: true, target: null };
  const raw = (body as Record<string, unknown>).redirectTo;
  if (raw === undefined || raw === null) return { allowed: true, target: null };
  if (typeof raw !== 'string' || !raw || hasUnsafeCharacters(raw)) return { allowed: false };

  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return { allowed: true, target: boundedTarget(raw) };
  }
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { allowed: false };
  }
  if (target.username || target.password || !allowedOrigins.includes(target.origin)) {
    return { allowed: false };
  }
  return { allowed: true, target: boundedTarget(target.href) };
}
