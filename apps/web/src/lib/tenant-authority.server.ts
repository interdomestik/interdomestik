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
