import 'server-only';

import { mintTenantAuthority } from '@interdomestik/database/tenant-authority-registrar';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';

import { auth } from './auth';
import { getCachedSession } from './auth.server';

type RequestSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

export type AuthorizedSession = Readonly<{
  session: RequestSession;
  authority: TenantAuthority;
}>;

/**
 * The request's authenticated session and the tenant authority it grants.
 *
 * The session is resolved here by better-auth from the request headers (the current request's,
 * or ones a request wrapper already read), never accepted as a session object from a caller, so
 * the authority's tenant, access tenant and principal are exactly what the authenticated session
 * carries (the access tenant, as ensureTenantId has always selected). Returns null when the request
 * is unauthenticated; throws MissingTenantError when the session has no tenant.
 */
export async function authorizeSessionTenant(
  requestHeaders?: Headers
): Promise<AuthorizedSession | null> {
  const session = requestHeaders
    ? await auth.api.getSession({ headers: requestHeaders })
    : await getCachedSession();
  if (!session?.user) return null;
  const tenantId = ensureTenantId(session);
  const authority = mintTenantAuthority({
    tenantId,
    accessTenantId: tenantId,
    purpose: 'session',
    principal: {
      userId: session.user.id,
      role: session.user.role ?? null,
      branchId: session.user.branchId ?? null,
      agentId: session.user.agentId ?? null,
    },
  });
  return Object.freeze({ session, authority });
}

/**
 * The authority of the request session, only when that session is the given user's: for pages that
 * already hold a session and must not read under anyone else's. Null when the request is
 * unauthenticated, has no tenant, or authenticates a different user.
 */
export async function authorizeSessionUserTenant(userId: string): Promise<TenantAuthority | null> {
  let authorized: AuthorizedSession | null;
  try {
    authorized = await authorizeSessionTenant();
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name !== 'MissingTenantError') throw error;
    return null;
  }
  return authorized && authorized.session.user.id === userId ? authorized.authority : null;
}
