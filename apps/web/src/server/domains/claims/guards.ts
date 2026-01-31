import { ensureTenantId, UnauthorizedError } from '@interdomestik/shared-auth';

// Define a minimal session interface that matches what we expect from auth()
// Adapting to your project's `Session` type which seems to be from 'better-auth' or 'next-auth'
// checking usages... usually inferred.
// We'll trust the caller passes the session object.

export interface ClaimsAccessContext {
  tenantId: string;
  role: string;
  branchId: string | null;
  userId: string;
}

// Minimal session type for what we consume here
export interface ClaimsSession {
  user: {
    id: string;
    role?: string | null;
    branchId?: string | null;
  };
}

export function ensureClaimsAccess(session: ClaimsSession | null): ClaimsAccessContext {
  if (!session || !session.user) {
    throw new UnauthorizedError();
  }

  const tenantId = ensureTenantId(session);
  const user = session.user;
  const role = user.role || 'member';
  const branchId = user.branchId || null;
  const userId = user.id;

  // Member access is allowed here because getClaimsListV2 is used by the universal /api/claims endpoint.
  // The query builder in queries.ts enforces strict owner-scoping (eq(claims.userId, userId)) for members.

  // We return the context, the Query Builder will apply the strict filters.
  return {
    tenantId,
    role,
    branchId,
    userId,
  };
}
