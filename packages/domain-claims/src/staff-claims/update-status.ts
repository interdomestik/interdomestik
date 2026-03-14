import {
  claimEscalationAgreements,
  claimStageHistory,
  claims,
  db,
  eq,
  serviceUsage,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import type { ActionResult, ClaimStatus, RecoveryDeclineReasonCode } from './types';

import { claimStatusSchema } from '../validators/claims';
import {
  getMatterAllowanceContextForSubscription,
  getMatterAllowanceSubscriptionContextForUser,
  getRecoveryMatterServiceCode,
  hasRecoveryMatterUsageForClaim,
} from './matter-allowance';
import { getRecoveryDeclineMemberDescription } from './recovery-decision';
import { upsertRecoveryDecisionRecord } from './save-recovery-decision';

const STAFF_LED_RECOVERY_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);
const RECOVERY_DECISION_REQUIRED_ERROR =
  'Staff must accept the recovery decision before staff-led recovery can begin.';
const RECOVERY_ALLOWANCE_EXHAUSTED_ERROR =
  'Matter allowance is exhausted. Record an override reason or upgrade the membership before staff-led recovery can begin.';
type UpdateClaimStatusParams = {
  claimId: string;
  declineReasonCode?: RecoveryDeclineReasonCode;
  decisionExplanation?: string;
  newStatus: string;
  note?: string;
  allowanceOverrideReason?: string;
  isPublicChange?: boolean;
  session: ClaimsSession | null;
  requestHeaders?: Headers;
};
type CurrentClaimRecord = {
  status: ClaimStatus | null;
  userId: string;
};
type RecoveryStatusChangeParams = {
  claimId: string;
  currentClaim: CurrentClaimRecord;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
  trimmedAllowanceOverrideReason?: string;
};

async function handleStaffLedRecoveryStatusChange(
  params: RecoveryStatusChangeParams
): Promise<ActionResult> {
  const {
    claimId,
    currentClaim,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    tenantId,
    trimmedAllowanceOverrideReason,
  } = params;
  const [agreement] = await db
    .select({
      decisionType: claimEscalationAgreements.decisionType,
    })
    .from(claimEscalationAgreements)
    .where(
      withTenant(
        tenantId,
        claimEscalationAgreements.tenantId,
        eq(claimEscalationAgreements.claimId, claimId)
      )
    )
    .limit(1);

  if (agreement?.decisionType !== 'accepted') {
    return {
      success: false,
      error: RECOVERY_DECISION_REQUIRED_ERROR,
    };
  }

  const matterAllowanceSubscription = await getMatterAllowanceSubscriptionContextForUser({
    tenantId,
    userId: currentClaim.userId,
  });

  if (!matterAllowanceSubscription) {
    return {
      success: false,
      error: 'Membership subscription context is required before staff-led recovery can begin.',
    };
  }

  const matterServiceCode = getRecoveryMatterServiceCode(claimId);
  const alreadyConsumedForClaim = await hasRecoveryMatterUsageForClaim({
    claimId,
    subscriptionId: matterAllowanceSubscription.subscriptionId,
    tenantId,
  });

  if (!alreadyConsumedForClaim) {
    const matterAllowanceContext = await getMatterAllowanceContextForSubscription({
      subscription: matterAllowanceSubscription,
      tenantId,
    });

    if (
      matterAllowanceContext.consumedCount >= matterAllowanceContext.allowanceTotal &&
      !trimmedAllowanceOverrideReason
    ) {
      return {
        success: false,
        error: RECOVERY_ALLOWANCE_EXHAUSTED_ERROR,
      };
    }
  }

  return finalizeClaimStatusChange({
    auditMetadata: {
      allowanceOverrideReason: trimmedAllowanceOverrideReason,
      matterConsumptionServiceCode: matterServiceCode,
    },
    beforePersist: async tx => {
      if (alreadyConsumedForClaim) {
        return;
      }

      await tx
        .insert(serviceUsage)
        .values({
          id: crypto.randomUUID(),
          tenantId,
          subscriptionId: matterAllowanceSubscription.subscriptionId,
          userId: currentClaim.userId,
          serviceCode: matterServiceCode,
          usedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [serviceUsage.tenantId, serviceUsage.subscriptionId, serviceUsage.serviceCode],
        })
        .returning({ id: serviceUsage.id });
    },
    claimId,
    currentStatus: currentClaim.status,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    tenantId,
  });
}

type ClaimsTransaction = {
  insert: typeof db.insert;
  select: typeof db.select;
  update: typeof db.update;
};

async function persistClaimStatusChange(params: {
  claimId: string;
  currentStatus: ClaimStatus | null;
  isPublicChange: boolean;
  note?: string;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
  tx: ClaimsTransaction;
}) {
  const { claimId, currentStatus, isPublicChange, note, session, status, tenantId, tx } = params;

  if (currentStatus !== status) {
    await tx
      .update(claims)
      .set({ status, updatedAt: new Date() })
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
  }

  await tx.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    tenantId,
    claimId,
    fromStatus: currentStatus,
    toStatus: status,
    changedById: session.user.id,
    changedByRole: 'staff',
    note: note || null,
    isPublic: isPublicChange,
    createdAt: new Date(),
  });
}

async function logClaimStatusAudit(params: {
  auditMetadata?: Record<string, boolean | string | undefined>;
  claimId: string;
  currentStatus: ClaimStatus | null;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
}) {
  const {
    auditMetadata,
    claimId,
    currentStatus,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    tenantId,
  } = params;

  if (!deps.logAuditEvent) {
    return;
  }

  await deps.logAuditEvent({
    actorId: session.user.id,
    actorRole: session.user.role,
    tenantId,
    action: 'claim.status_changed',
    entityType: 'claim',
    entityId: claimId,
    metadata: {
      oldStatus: currentStatus,
      newStatus: status,
      note: note || undefined,
      isPublic: isPublicChange,
      ...auditMetadata,
    },
    headers: requestHeaders,
  });
}

async function finalizeClaimStatusChange(params: {
  auditMetadata?: Record<string, boolean | string | undefined>;
  beforePersist?: (tx: ClaimsTransaction) => Promise<void>;
  claimId: string;
  currentStatus: ClaimStatus | null;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
}): Promise<ActionResult> {
  const { beforePersist, ...rest } = params;

  await db.transaction(async tx => {
    if (beforePersist) {
      await beforePersist(tx);
    }

    await persistClaimStatusChange({
      claimId: rest.claimId,
      currentStatus: rest.currentStatus,
      isPublicChange: rest.isPublicChange,
      note: rest.note,
      session: rest.session,
      status: rest.status,
      tenantId: rest.tenantId,
      tx,
    });
  });

  await logClaimStatusAudit(rest);

  return { success: true };
}

/** Update claim status and optionally add a history note */
export async function updateClaimStatusCore(
  params: UpdateClaimStatusParams,
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { claimId, newStatus, note, isPublicChange = true, session } = params;

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate status
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status' };
  }
  const status = parsed.data.status as ClaimStatus; // NOSONAR

  const tenantId = ensureTenantId(session);
  const trimmedNote = note?.trim() || undefined;
  const trimmedAllowanceOverrideReason = params.allowanceOverrideReason?.trim() || undefined;
  const trimmedDecisionExplanation = params.decisionExplanation?.trim() || undefined;

  try {
    const [currentClaim] = await db
      .select({ status: claims.status, userId: claims.userId })
      .from(claims)
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)))
      .limit(1);

    if (!currentClaim) {
      return { success: false, error: 'Claim not found' };
    }

    if (currentClaim.status === status && !trimmedNote) {
      return { success: true }; // No change needed
    }

    if (currentClaim.status !== status && status === 'rejected' && !params.declineReasonCode) {
      return {
        success: false,
        error: 'Decline reason category is required when staff reject a recovery matter.',
      };
    }

    if (currentClaim.status !== status && STAFF_LED_RECOVERY_STATUSES.has(status)) {
      return handleStaffLedRecoveryStatusChange({
        claimId,
        currentClaim,
        deps,
        isPublicChange,
        note: trimmedNote,
        requestHeaders: params.requestHeaders,
        session,
        status,
        tenantId,
        trimmedAllowanceOverrideReason,
      });
    }

    if (currentClaim.status !== status && status === 'rejected' && params.declineReasonCode) {
      const publicDeclineNote =
        trimmedNote || getRecoveryDeclineMemberDescription(params.declineReasonCode);

      return finalizeClaimStatusChange({
        auditMetadata: {
          decisionNextStatus: 'rejected',
          declineReasonCode: params.declineReasonCode,
          decisionReason: trimmedDecisionExplanation,
          decisionType: 'declined',
        },
        beforePersist: async tx => {
          await upsertRecoveryDecisionRecord({
            claimId,
            decisionType: 'declined',
            declineReasonCode: params.declineReasonCode,
            explanation: trimmedDecisionExplanation,
            session,
            tenantId,
            tx,
          });
        },
        claimId,
        currentStatus: currentClaim.status,
        deps,
        isPublicChange,
        note: publicDeclineNote,
        requestHeaders: params.requestHeaders,
        session,
        status,
        tenantId,
      });
    }

    return finalizeClaimStatusChange({
      claimId,
      currentStatus: currentClaim.status,
      deps,
      isPublicChange,
      note: trimmedNote,
      requestHeaders: params.requestHeaders,
      session,
      status,
      tenantId,
    });
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
