import { and, claims, eq, inArray, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { isNull, or, sql, type SQLWrapper } from 'drizzle-orm';

import { claimLifecycleStatusNotIn } from '../claims/lifecycle-read-sql';
import type { ClaimsSession } from '../claims/types';

type StaffClaimScopeArgs = {
  role?: string;
  branchId?: string | null;
  claimId: string;
  tenantId: string;
  userId: string;
};

type StaffClaimReadScopeArgs = Pick<StaffClaimScopeArgs, 'role'> & {
  branchId?: string | SQLWrapper | null;
  userId: string | SQLWrapper;
} & ({ claimId: string } | { claimIds: readonly string[] });

export const STAFF_SCOPE_ACCESS_DENIED_ERROR = 'Claim not found or access denied';

/**
 * A member's draft is not staff work until it is submitted: every staff read and write goes through
 * this scope, so a draft is denied like an unknown claim. A malformed lifecycle pair reads as NULL
 * and is denied too.
 */
export function buildStaffClaimReadScope(args: StaffClaimReadScopeArgs) {
  if (
    args.role === 'branch_manager' &&
    (typeof args.branchId !== 'string' || !args.branchId.trim())
  ) {
    return sql`false`;
  }
  const selection =
    'claimId' in args ? eq(claims.id, args.claimId) : inArray(claims.id, [...args.claimIds]);
  const submitted = claimLifecycleStatusNotIn(['draft']);
  const assignedOrUnassigned = or(eq(claims.staffId, args.userId), isNull(claims.staffId));
  if (args.branchId == null) {
    return and(selection, submitted, assignedOrUnassigned);
  }
  const sameBranch = eq(claims.branchId, args.branchId);
  if (typeof args.branchId === 'string') return and(selection, submitted, sameBranch);
  return and(
    selection,
    submitted,
    or(sameBranch, and(isNull(args.branchId), assignedOrUnassigned))
  );
}

export function buildScopedStaffClaimWhere(args: StaffClaimScopeArgs) {
  return withTenant(args.tenantId, claims.tenantId, buildStaffClaimReadScope(args));
}

export function resolveScopedStaffClaimAccess(params: {
  claimId: string;
  session: ClaimsSession;
}): StaffClaimScopeArgs {
  return {
    role: params.session.user.role ?? undefined,
    branchId: params.session.user.branchId ?? null,
    claimId: params.claimId,
    tenantId: ensureTenantId(params.session),
    userId: params.session.user.id,
  };
}

export async function canStaffReadClaim(
  tx: TenantTransaction,
  recipient: Omit<StaffClaimScopeArgs, 'role'>
): Promise<boolean> {
  const [claim] = await tx
    .select({ id: claims.id })
    .from(claims)
    .where(buildScopedStaffClaimWhere({ ...recipient, role: 'staff' }));
  return Boolean(claim);
}
