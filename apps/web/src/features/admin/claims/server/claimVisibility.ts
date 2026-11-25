// v2.0.2-admin-claims-ops — RBAC + Tenant Visibility
import { claims } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { eq, sql, type SQL } from 'drizzle-orm';

export { canViewAdminClaims } from '@interdomestik/domain-claims/admin-claims/visible-ops-claim';

/**
 * Resolved visibility context for claims queries.
 */
export interface ClaimsVisibilityContext {
  tenantId: string;
  userId: string;
  role: string | null;
  branchId: string | null;
}

/**
 * Session with user shape expected from auth.api.getSession
 */
interface SessionWithUser {
  session: { id: string };
  user: {
    id: string;
    tenantId?: string;
    role?: string;
    branchId?: string;
  };
}

/**
 * Resolves visibility context from session.
 * Ensures tenant scoping is applied.
 */
export async function resolveClaimsVisibility(
  sessionData: SessionWithUser | null
): Promise<ClaimsVisibilityContext | null> {
  if (!sessionData?.user) {
    return null;
  }

  const { user } = sessionData;
  const tenantId = ensureTenantId(sessionData);

  if (!tenantId) {
    return null;
  }

  return {
    tenantId,
    userId: user.id,
    role: user.role ?? null,
    branchId: user.branchId ?? null,
  };
}

/**
 * Branch-manager claim scope for admin claims queries.
 * Returns the own-branch condition, a deny-all condition when the branch is missing,
 * or undefined for roles without branch scoping.
 */
export function adminClaimsBranchCondition(
  context: Pick<ClaimsVisibilityContext, 'role' | 'branchId'>
): SQL | undefined {
  if (context.role !== 'branch_manager') {
    return undefined;
  }
  return context.branchId ? eq(claims.branchId, context.branchId) : sql`false`;
}
