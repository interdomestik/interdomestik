import { and, claims, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { isNull, or } from 'drizzle-orm';

import { claimLifecycleStatusNotIn } from '../claims/lifecycle-read-sql';
import type { ClaimsSession } from '../claims/types';

type StaffClaimScopeArgs = {
  branchId?: string | null;
  claimId: string;
  tenantId: string;
  userId: string;
};

export const STAFF_SCOPE_ACCESS_DENIED_ERROR = 'Claim not found or access denied';

/**
 * A member's draft is not staff work until it is submitted: every staff read and write goes through
 * this scope, so a draft is denied like an unknown claim. A malformed lifecycle pair reads as NULL
 * and is denied too.
 */
export function buildStaffClaimReadScope(args: Omit<StaffClaimScopeArgs, 'tenantId'>) {
  const submitted = claimLifecycleStatusNotIn(['draft']);
  if (args.branchId == null) {
    return and(
      eq(claims.id, args.claimId),
      submitted,
      or(eq(claims.staffId, args.userId), isNull(claims.staffId))
    );
  }

  return and(eq(claims.id, args.claimId), submitted, eq(claims.branchId, args.branchId));
}

export function buildScopedStaffClaimWhere(args: StaffClaimScopeArgs) {
  return withTenant(args.tenantId, claims.tenantId, buildStaffClaimReadScope(args));
}

export function resolveScopedStaffClaimAccess(params: {
  claimId: string;
  session: ClaimsSession;
}): StaffClaimScopeArgs {
  return {
    branchId: params.session.user.branchId ?? null,
    claimId: params.claimId,
    tenantId: ensureTenantId(params.session),
    userId: params.session.user.id,
  };
}
