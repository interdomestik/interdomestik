import { and, claims, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { isNull, or } from 'drizzle-orm';

type StaffClaimScopeArgs = {
  branchId?: string | null;
  claimId: string;
  tenantId: string;
  userId: string;
};

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
