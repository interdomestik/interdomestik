import { and, claims, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { isNull, or } from 'drizzle-orm';

import type { ClaimsSession } from '../claims/types';

type StaffClaimScopeArgs = {
  branchId?: string | null;
  claimId: string;
  tenantId: string;
  userId: string;
};

export const STAFF_SCOPE_ACCESS_DENIED_ERROR = 'Claim not found or access denied';

export function buildStaffClaimReadScope(args: Omit<StaffClaimScopeArgs, 'tenantId'>) {
  if (args.branchId == null) {
    return and(
      eq(claims.id, args.claimId),
      or(eq(claims.staffId, args.userId), isNull(claims.staffId))
    );
  }

  return and(eq(claims.id, args.claimId), eq(claims.branchId, args.branchId));
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
