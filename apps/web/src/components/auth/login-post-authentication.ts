import { authClient } from '@/lib/auth-client';
import { emitAuthTelemetryEvent } from '@/lib/auth-telemetry';
import {
  getCanonicalRouteForRole,
  getValidatedLocaleFromPathname,
  stripLocalePrefixFromCanonicalRoute,
} from '@/lib/canonical-routes';

import { resolveSafeNextPath } from './login-next-path';

const SESSION_SYNC_RETRY_COUNT = 2;
const SESSION_SYNC_RETRY_DELAY_MS = 250;

export type ResolvedAuthenticatedRole = { role?: string; timedOut: boolean };

/**
 * Reads the role the provider established for the new session, retrying once while the client
 * session cookie propagates.
 */
export async function resolveAuthenticatedRole(): Promise<ResolvedAuthenticatedRole> {
  for (let attempt = 0; attempt < SESSION_SYNC_RETRY_COUNT; attempt += 1) {
    const { data: session } = await authClient.getSession();
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role) {
      return { role, timedOut: false };
    }

    if (attempt < SESSION_SYNC_RETRY_COUNT - 1) {
      await new Promise(resolve => setTimeout(resolve, SESSION_SYNC_RETRY_DELAY_MS));
    }
  }

  return { timedOut: true };
}

export function emitPostLoginFailureTelemetry(
  reason: 'post_login_sync_timeout' | 'unsupported_redirect_target',
  pathname: string,
  tenantId?: string
): void {
  emitAuthTelemetryEvent({
    eventName: 'staff_post_login_redirect_failed',
    tenant: tenantId,
    locale: getValidatedLocaleFromPathname(pathname),
    surface: 'unknown',
    host: globalThis.location?.host ?? null,
    pathname,
    reason,
  });
}

export type PostLoginTarget = { kind: 'navigate'; target: string } | { kind: 'unsupported_role' };

/**
 * Resolves where an authenticated session continues: a validated role-scoped continuation first,
 * then the selected plan flow for a member, then the canonical route for the role.
 */
export function resolvePostLoginTarget(args: {
  role: string;
  locale: string;
  nextPathFromQuery: string | null;
  planIdFromQuery?: string;
  hash?: string;
}): PostLoginTarget {
  const { role, locale, nextPathFromQuery, planIdFromQuery, hash } = args;

  const canonical = getCanonicalRouteForRole(role, locale);
  if (!canonical) return { kind: 'unsupported_role' };

  const target = stripLocalePrefixFromCanonicalRoute(canonical, locale);
  if (!target) return { kind: 'unsupported_role' };

  const safeNextPath = resolveSafeNextPath(nextPathFromQuery, role, locale, hash);
  if (safeNextPath) return { kind: 'navigate', target: safeNextPath };

  if (planIdFromQuery && target === '/member') {
    const pricingParams = new URLSearchParams();
    pricingParams.set('plan', planIdFromQuery);
    return { kind: 'navigate', target: `/${locale}/pricing?${pricingParams}` };
  }

  return { kind: 'navigate', target: canonical };
}
