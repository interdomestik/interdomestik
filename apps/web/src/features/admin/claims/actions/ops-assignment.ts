import { and, claims, eq, isNull, user, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import {
  assertCanMutateClaim,
  getClaimForMutation,
  logAudit,
  type OpsActionResponse,
} from './action-helpers';

export const ASSIGNMENT_TARGET_ROLE = 'staff';
export const ASSIGNMENT_TARGET_DENIED_ERROR = 'Staff member not found or out of scope';
export const ASSIGNMENT_CONFLICT_ERROR = 'Claim changed. Reload and try again.';

export type AssignClaimOwnerParams = {
  actorId: string;
  actorRole: string;
  claimId: string;
  staffId: string;
  tenantId: string;
};

type AssignmentGuardSnapshot = Pick<
  typeof claims.$inferSelect,
  'staffId' | 'caseLifecycleState' | 'recoveryLifecycleState'
>;

// Same staff compare-and-set shape as the staff-domain assignment writer, plus the read lifecycle
// pair so a concurrent close between the terminal check and this write conflicts instead of
// assigning a closed claim.
function buildAssignmentGuard(read: AssignmentGuardSnapshot) {
  return and(
    read.staffId ? eq(claims.staffId, read.staffId) : isNull(claims.staffId),
    eq(claims.caseLifecycleState, read.caseLifecycleState),
    eq(claims.recoveryLifecycleState, read.recoveryLifecycleState)
  );
}

// FOR SHARE holds the eligible target row until this transaction ends, so a concurrent role or
// tenant change (UPDATE, or the role writers' FOR UPDATE lock) cannot commit between this check and
// the assignment write and audit. A change that commits first makes the re-checked predicate return
// no row. FOR KEY SHARE would not block non-key role changes.
async function findAssignableStaff(
  tx: TenantTransaction,
  tenantId: string,
  staffId: string
): Promise<{ id: string } | undefined> {
  // db-access-guard: tenant-scoped -- reason: tenant predicate built by withTenant inside tenant transaction
  const [target] = await tx
    .select({ id: user.id })
    .from(user)
    .where(
      withTenant(
        tenantId,
        user.tenantId,
        and(eq(user.id, staffId), eq(user.role, ASSIGNMENT_TARGET_ROLE))
      )
    )
    .for('share');
  return target;
}

/** Claim read, locked target validation, CAS update and audit share one tenant transaction. */
export async function assignClaimOwnerInTransaction(
  tx: TenantTransaction,
  params: AssignClaimOwnerParams
): Promise<OpsActionResponse> {
  const { actorId, actorRole, claimId, staffId, tenantId } = params;

  const claim = await getClaimForMutation(claimId, tenantId, tx);
  assertCanMutateClaim(claim, actorRole, 'assign');

  const target = await findAssignableStaff(tx, tenantId, staffId);
  if (!target) return { success: false, error: ASSIGNMENT_TARGET_DENIED_ERROR };

  const now = new Date();
  // db-access-guard: tenant-scoped -- reason: tenant predicate consumed by this tenant-transaction update
  const updated = await tx
    .update(claims)
    .set({ staffId, assignedAt: now, assignedById: actorId, updatedAt: now })
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId), buildAssignmentGuard(claim)))
    .returning({
      id: claims.id,
      staffId: claims.staffId,
      assignedAt: claims.assignedAt,
      assignedById: claims.assignedById,
    });

  if (updated.length === 0) return { success: false, error: ASSIGNMENT_CONFLICT_ERROR };

  // Audit failure throws inside the transaction and rolls the update back.
  await logAudit(
    tenantId,
    actorId,
    'assign_owner',
    claimId,
    { previousStaffId: claim.staffId, newStaffId: staffId, claimNumber: claim.claimNumber },
    tx
  );

  return { success: true, data: updated[0] };
}
