// Fixed reviewed runtime grammar; never populated from candidate input at validation time.
export const CONTRACT = String.raw`import type { TenantTransaction } from '@interdomestik/database';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';
import { claims } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

import { isTerminalStatus } from '../../features/admin/claims/types';
import {
  assignmentSnapshotGuard,
  insertAssignmentAudit,
  lockEligibleStaff,
  staffResourceScope,
  type M4AssignmentActor,
  type M4AssignmentObservation,
} from './m4-assignment-kernel-shared';

type LegacyResult =
  { success: true; error: undefined } | { success: false; error: string; data: undefined };
type LegacyInput = {
  actor: M4AssignmentActor;
  claimId: string;
  staffId: string | null;
  observation: M4AssignmentObservation;
};
export type LegacyAssignmentOutcome = {
  result: LegacyResult;
  changed: boolean;
  // Private postcommit notification data; never returned in the public assignment DTO.
  notification?: {
    staffId: string;
    email: string;
    name: string;
    claim: { id: string; title: string };
  };
};

function denied(error: string): LegacyAssignmentOutcome {
  return { result: { success: false, error, data: undefined }, changed: false };
}

// Fixed source-bound entries preserve the two existing wrapper behaviours. No request may
// select skipNoop or inject a profile callback; only these two literal invocations exist.
export function assignLegacyAdminInTransaction(tx: TenantTransaction, input: LegacyInput) {
  return assignLegacyInTransaction(tx, input, true);
}
export function assignLegacyAgentInTransaction(tx: TenantTransaction, input: LegacyInput) {
  return assignLegacyInTransaction(tx, input, false);
}

async function assignLegacyInTransaction(
  tx: TenantTransaction,
  input: LegacyInput,
  skipNoop: boolean
): Promise<LegacyAssignmentOutcome> {
  const { actor, claimId, staffId, observation } = input;
  if (actor.role !== 'staff' && actor.role !== 'admin') return denied('Unauthorized');
  if (staffId !== null && (typeof staffId !== 'string' || staffId.length === 0))
    return denied('Invalid staff assignment');
  if (actor.role === 'staff' && staffId && staffId !== actor.id)
    return denied('Access denied: Cannot assign other staff');

  const scope =
    actor.role === 'staff'
      ? staffResourceScope(actor, claimId)
      : and(eq(claims.id, claimId), eq(claims.tenantId, actor.tenantId));
  const [claim] = await tx
    .select({
      id: claims.id,
      title: claims.title,
      staffId: claims.staffId,
      branchId: claims.branchId,
      caseLifecycleState: claims.caseLifecycleState,
      recoveryLifecycleState: claims.recoveryLifecycleState,
    })
    .from(claims)
    .where(scope)
    .limit(1)
    .for('update');
  if (!claim) return denied('Claim not found');

  // Self and no-op requests also require current eligibility. Historical links are never
  // deleted or rewritten merely because the current target no longer qualifies.
  const target =
    staffId === null ? undefined : await lockEligibleStaff(tx, actor.tenantId, staffId, null);
  if (staffId !== null && !target) return denied('Staff member not found');
  const changed = claim.staffId !== staffId;
  if (skipNoop && !changed) return { result: { success: true, error: undefined }, changed: false };
  if (isTerminalStatus(claimStatusFromLifecycleFields(claim)))
    return denied('Cannot perform assign on a terminal claim.');

  // Legacy preserves its exact write shape: assignment timestamps are not rewritten/cleared.
  const rows = await tx
    .update(claims)
    .set({ staffId })
    .where(and(scope, assignmentSnapshotGuard(claim)))
    .returning({ id: claims.id });
  if (rows.length === 0) return denied('Claim not found');
  await insertAssignmentAudit(tx, actor, claimId, claim.staffId, staffId, observation);
  return {
    result: { success: true, error: undefined },
    changed,
    ...(target?.email
      ? {
          notification: {
            staffId: target.id,
            email: target.email,
            name: target.name || 'Staff',
            claim: { id: claim.id, title: claim.title },
          },
        }
      : {}),
  };
}
`;
