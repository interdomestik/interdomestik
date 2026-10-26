// Fixed reviewed runtime grammar; never populated from candidate input at validation time.
export const CONTRACT = String.raw`import type { TenantTransaction } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { claims } from '@interdomestik/database/schema';
import { and } from 'drizzle-orm';

import { isTerminalStatus } from '../../features/admin/claims/types';
import {
  assignmentSnapshotGuard,
  insertAssignmentAudit,
  lockEligibleStaff,
  staffResourceScope,
  type M4AssignmentActor,
  type M4AssignmentObservation,
} from './m4-assignment-kernel-shared';

type StaffResult = { success: boolean; error?: string; data?: undefined };
export type StaffAssignmentOutcome = { result: StaffResult; changed: boolean };

/** Caller owns the transaction and current actor lock; SQL/audit failures must escape it. */
export async function assignStaffInTransaction(
  tx: TenantTransaction,
  input: {
    actor: M4AssignmentActor;
    claimId: string;
    staffId?: string | null;
    observation: M4AssignmentObservation;
  }
): Promise<StaffAssignmentOutcome> {
  const { actor, claimId, observation } = input;
  const deny = (error: string): StaffAssignmentOutcome => ({
    result: { success: false, error },
    changed: false,
  });
  if (actor.role !== 'staff') return deny('Unauthorized');
  const staffId = input.staffId === undefined ? actor.id : input.staffId;
  if (staffId !== null && (typeof staffId !== 'string' || staffId.length === 0))
    return {
      result: {
        success: false,
        error: 'Invalid staff assignment',
        data: undefined,
      },
      changed: false,
    };

  const scope = staffResourceScope(actor, claimId);
  const [claim] = await tx
    .select({
      id: claims.id,
      staffId: claims.staffId,
      branchId: claims.branchId,
      caseLifecycleState: claims.caseLifecycleState,
      recoveryLifecycleState: claims.recoveryLifecycleState,
    })
    .from(claims)
    .where(scope)
    .limit(1)
    .for('update');
  if (!claim) return deny('Claim not found or access denied');
  if (staffId !== null && !(await lockEligibleStaff(tx, actor.tenantId, staffId, actor.branchId)))
    return deny('Staff member not found or out of scope');
  if (claim.staffId === staffId) return { result: { success: true }, changed: false };
  if (isTerminalStatus(claimStatusFromLifecycleFields(claim)))
    return deny('Cannot perform assign on a terminal claim.');

  const now = new Date();
  const rows = await tx
    .update(claims)
    .set({
      staffId,
      assignedAt: staffId ? now : null,
      assignedById: staffId ? actor.id : null,
      updatedAt: now,
    })
    .where(and(scope, assignmentSnapshotGuard(claim)))
    .returning({ id: claims.id });
  if (rows.length === 0) return deny('Claim not found or access denied');
  await insertAssignmentAudit(tx, actor, claimId, claim.staffId, staffId, observation);
  return { result: { success: true }, changed: true };
}
`;
