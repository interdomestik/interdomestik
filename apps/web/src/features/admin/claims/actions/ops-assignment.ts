import { type TenantTransaction } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { auditLog, claims, user } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { isTerminalStatus } from '../types';
import { OpsDomainDenialError, type OpsActionResult } from './ops-action-outcome';

export const ASSIGNMENT_TARGET_ROLE = 'staff';
export const ASSIGNMENT_TARGET_DENIED_ERROR = 'Staff member not found or out of scope';
export const ASSIGNMENT_CONFLICT_ERROR = 'Claim changed. Reload and try again.';
const CLAIM_NOT_FOUND_ERROR = 'Claim not found or access denied';
const TERMINAL_CLAIM_ERROR = 'Cannot perform assign on a terminal claim.';

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
): Promise<OpsActionResult> {
  const { actorId, claimId, staffId, tenantId } = params;

  // The caller admits the actor and owns this transaction; this kernel receives no global client.
  const [claim] = await tx
    .select({
      staffId: claims.staffId,
      claimNumber: claims.claimNumber,
      caseLifecycleState: claims.caseLifecycleState,
      recoveryLifecycleState: claims.recoveryLifecycleState,
    })
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.tenantId, tenantId)))
    .limit(1);
  if (!claim) throw new OpsDomainDenialError(CLAIM_NOT_FOUND_ERROR);
  if (isTerminalStatus(claimStatusFromLifecycleFields(claim))) {
    throw new OpsDomainDenialError(TERMINAL_CLAIM_ERROR);
  }

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
  await tx.insert(auditLog).values({
    id: nanoid(),
    tenantId,
    actorId,
    action: 'assign_owner',
    entityType: 'claim',
    entityId: claimId,
    metadata: {
      previousStaffId: claim.staffId,
      newStaffId: staffId,
      claimNumber: claim.claimNumber,
    },
    createdAt: new Date(),
  });

  return { success: true, data: updated[0] };
}
