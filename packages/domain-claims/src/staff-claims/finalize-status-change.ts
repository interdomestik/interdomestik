// Staff status change finalization: the central transition phases plus the staff-only decision
// record, usage consumption and assignment, all inside the caller's tenant transaction.
import { claims, serviceUsage, sql, type TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import {
  authorizeClaimTransitionInTransaction,
  recordAuthorizedTransitionSideEffects,
  writeAuthorizedTransitionStatus,
  type PersistAuthorizedTransitionArgs,
  type TransitionTx,
} from '../claims/transition';
import type { CurrentClaimRecord } from './current-claim-record';
import { upsertRecoveryDecisionRecord } from './recovery-decision-record';
import { safePublicStatusNote } from './rejected-claim-public-note';
import { buildScopedStaffClaimWhere, STAFF_SCOPE_ACCESS_DENIED_ERROR } from './scope';
import type { ActionResult, ClaimStatus, RecoveryDeclineReasonCode } from './types';
import { scheduleStatusChangeNotification } from './update-status-notification';

export type StaffScopeWhere = ReturnType<typeof buildScopedStaffClaimWhere>;
export type StatusChangeResult = ActionResult & { afterCommit?: () => Promise<void> };
export type RecoveryStatusChangeParams = {
  authority: TenantAuthority;
  tx: TenantTransaction;
  claimId: string;
  currentClaim: CurrentClaimRecord;
  deps: ClaimsDeps;
  hostId?: string | null;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  staffScopeWhere: StaffScopeWhere;
  tenantId: string;
  trimmedAllowanceOverrideReason?: string;
};
async function assignClaimToActingStaffIfUnassigned(params: {
  currentStaffId: string | null;
  session: ClaimsSession;
  staffScopeWhere: StaffScopeWhere;
  tenantId: string;
  tx: TenantTransaction;
}) {
  if (params.currentStaffId != null) {
    return;
  }
  const now = new Date();
  // db-access-guard: tenant-scoped -- reason: staffScopeWhere includes tenant, claim, branch, and assignment scope
  await params.tx
    .update(claims)
    .set({
      staffId: sql`coalesce(${claims.staffId}, ${params.session.user.id})`,
      assignedAt: sql`coalesce(${claims.assignedAt}, ${now.toISOString().slice(0, -1)}::timestamp)`,
      assignedById: sql`coalesce(${claims.assignedById}, ${params.session.user.id})`,
      updatedAt: now,
    })
    .where(params.staffScopeWhere);
}

type MatterUsage = { serviceCode: string; subscriptionId: string; userId: string };
type RecoveryDecline = {
  declineReasonCode?: RecoveryDeclineReasonCode;
  explanation?: string;
};

async function persistStaffTransition(
  tx: TenantTransaction,
  transition: PersistAuthorizedTransitionArgs,
  recoveryDecline: RecoveryDecline | undefined,
  session: ClaimsSession
): Promise<{ success: true; fromStatus: ClaimStatus }> {
  const { claimId, tenantId } = transition;
  if (recoveryDecline) {
    await upsertRecoveryDecisionRecord({
      claimId,
      decisionType: 'declined',
      declineReasonCode: recoveryDecline.declineReasonCode,
      explanation: recoveryDecline.explanation,
      session,
      tenantId,
      tx,
    });
  }
  const transitionTx = tx as unknown as TransitionTx;
  const written = await writeAuthorizedTransitionStatus(transitionTx, transition);
  const note = await safePublicStatusNote(tx, {
    claimId,
    fromStatus: transition.current.status,
    isPublic: transition.isPublic,
    note: transition.note,
    tenantId,
  });
  await recordAuthorizedTransitionSideEffects(transitionTx, transition, written, note);
  return { success: true, fromStatus: transition.current.status };
}

async function recordMatterServiceUsage(
  tx: TenantTransaction,
  tenantId: string,
  usage: MatterUsage
): Promise<void> {
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  await tx
    .insert(serviceUsage)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      subscriptionId: usage.subscriptionId,
      userId: usage.userId,
      serviceCode: usage.serviceCode,
      usedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [serviceUsage.tenantId, serviceUsage.subscriptionId, serviceUsage.serviceCode],
    })
    .returning({ id: serviceUsage.id });
}

export async function finalizeClaimStatusChange(
  params: Omit<RecoveryStatusChangeParams, 'currentClaim' | 'trimmedAllowanceOverrideReason'> & {
    /** Usage to consume after the status write (staff-led recovery). */
    matterUsage?: MatterUsage;
    /** A decline decision to record after authorization and before the status write. */
    recoveryDecline?: RecoveryDecline;
    currentStatus: ClaimStatus | null;
    currentStaffId: string | null;
    currentTitle: string;
    currentUserId: string;
  }
): Promise<StatusChangeResult> {
  const { tx, matterUsage, recoveryDecline, ...rest } = params;
  const transitionTx = tx as unknown as TransitionTx;

  // One transaction, in this order: authorization, the authorized pre-write decision record,
  // the status CAS, the public note resolution, history/events, then usage and assignment.
  const authorized = await authorizeClaimTransitionInTransaction(transitionTx, {
    actor: { id: rest.session.user.id, role: 'staff' },
    claimId: rest.claimId,
    hostId: rest.hostId,
    isPublic: rest.isPublicChange,
    note: rest.note ?? null,
    requiredWhereCondition: rest.staffScopeWhere,
    tenantId: rest.tenantId,
    toStatus: rest.status,
  });
  const transitionResult = authorized.success
    ? await persistStaffTransition(tx, authorized.transition, recoveryDecline, rest.session)
    : authorized;

  if (transitionResult.success) {
    if (matterUsage) await recordMatterServiceUsage(tx, rest.tenantId, matterUsage);

    await assignClaimToActingStaffIfUnassigned({
      currentStaffId: rest.currentStaffId,
      session: rest.session,
      staffScopeWhere: rest.staffScopeWhere,
      tenantId: rest.tenantId,
      tx,
    });
  }

  if (!transitionResult.success) {
    return {
      success: false,
      error:
        transitionResult.error === 'claim_not_found'
          ? STAFF_SCOPE_ACCESS_DENIED_ERROR
          : 'Failed to update claim status',
    };
  }

  const sideEffectParams = { ...rest, currentStatus: transitionResult.fromStatus };

  return {
    success: true,
    afterCommit: async () => {
      await activateClaimStatusAuditProjection({
        authority: sideEffectParams.authority,
        deps: sideEffectParams.deps,
      });

      if (sideEffectParams.isPublicChange) {
        scheduleStatusChangeNotification({
          authority: sideEffectParams.authority,
          claimId: sideEffectParams.claimId,
          claimTitle: sideEffectParams.currentTitle,
          deps: sideEffectParams.deps,
          newStatus: sideEffectParams.status,
          oldStatus: sideEffectParams.currentStatus,
          userId: sideEffectParams.currentUserId,
        });
      }
    },
  };
}

/** Update claim status and optionally add a history note */
