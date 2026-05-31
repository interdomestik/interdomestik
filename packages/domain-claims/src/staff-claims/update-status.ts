import {
  claimEscalationAgreements,
  claims,
  db,
  eq,
  serviceUsage,
  sql,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import type { ActionResult, ClaimStatus, RecoveryDeclineReasonCode } from './types';

import {
  buildAcceptedRecoveryPrerequisitesSnapshot,
  buildCommercialAgreementSnapshot,
  buildSuccessFeeCollectionSnapshot,
} from './accepted-recovery-prerequisites';
import { resolveCommercialHandlingScopeGate } from './commercial-handling-scope';
import { claimStatusSchema } from '../validators/claims';
import {
  getMatterAllowanceContextForSubscription,
  getMatterAllowanceSubscriptionContextForUser,
  getRecoveryMatterServiceCode,
  hasRecoveryMatterUsageForClaim,
} from './matter-allowance';
import {
  buildRecoveryDecisionSnapshot,
  getRecoveryDeclineMemberDescription,
} from './recovery-decision';
import { upsertRecoveryDecisionRecord } from './save-recovery-decision';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';
import { transitionClaimStatusInTransaction } from '../claims/transition';

type StaffScopeWhere = ReturnType<typeof buildScopedStaffClaimWhere>;

const STAFF_LED_RECOVERY_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);
const RECOVERY_DECISION_REQUIRED_ERROR =
  'Staff must accept the recovery decision before staff-led recovery can begin.';
const RECOVERY_COMMERCIAL_AGREEMENT_REQUIRED_ERROR =
  'Save the accepted escalation agreement before staff-led recovery can begin.';
const RECOVERY_COLLECTION_PATH_REQUIRED_ERROR =
  'Save the success-fee collection path before staff-led recovery can begin.';
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
  category: string;
  staffId: string | null;
  status: ClaimStatus | null;
  title: string;
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
  staffScopeWhere: StaffScopeWhere;
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
    staffScopeWhere,
    tenantId,
    trimmedAllowanceOverrideReason,
  } = params;
  const { error: commercialScopeError, scope: commercialScope } =
    resolveCommercialHandlingScopeGate({
      claimCategory: currentClaim.category,
      fallbackError: 'Staff-led recovery is not available for this claim.',
    });

  if (commercialScopeError) {
    return {
      success: false,
      error: commercialScopeError,
    };
  }

  const [agreement] = await db
    .select({
      acceptedAt: claimEscalationAgreements.acceptedAt,
      decisionNextStatus: claimEscalationAgreements.decisionNextStatus,
      decisionReason: claimEscalationAgreements.decisionReason,
      decisionType: claimEscalationAgreements.decisionType,
      feePercentage: claimEscalationAgreements.feePercentage,
      legalActionCapPercentage: claimEscalationAgreements.legalActionCapPercentage,
      minimumFee: claimEscalationAgreements.minimumFee,
      paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
      signedAt: claimEscalationAgreements.signedAt,
      successFeeAmount: claimEscalationAgreements.successFeeAmount,
      successFeeCollectionMethod: claimEscalationAgreements.successFeeCollectionMethod,
      successFeeCurrencyCode: claimEscalationAgreements.successFeeCurrencyCode,
      successFeeDeductionAllowed: claimEscalationAgreements.successFeeDeductionAllowed,
      successFeeHasStoredPaymentMethod: claimEscalationAgreements.successFeeHasStoredPaymentMethod,
      successFeeInvoiceDueAt: claimEscalationAgreements.successFeeInvoiceDueAt,
      successFeeRecoveredAmount: claimEscalationAgreements.successFeeRecoveredAmount,
      successFeeResolvedAt: claimEscalationAgreements.successFeeResolvedAt,
      successFeeSubscriptionId: claimEscalationAgreements.successFeeSubscriptionId,
      termsVersion: claimEscalationAgreements.termsVersion,
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

  const recoveryDecision = buildRecoveryDecisionSnapshot({
    decidedAt: agreement?.acceptedAt,
    decisionType: agreement?.decisionType ?? null,
    explanation: agreement?.decisionReason ?? null,
  });

  if (recoveryDecision.status !== 'accepted') {
    return {
      success: false,
      error: RECOVERY_DECISION_REQUIRED_ERROR,
    };
  }

  const commercialAgreement = buildCommercialAgreementSnapshot({
    claimId,
    ...(agreement ?? {}),
  });

  if (!commercialAgreement) {
    return {
      success: false,
      error: RECOVERY_COMMERCIAL_AGREEMENT_REQUIRED_ERROR,
    };
  }

  const successFeeCollection = buildSuccessFeeCollectionSnapshot({
    claimId,
    collectionMethod: agreement?.successFeeCollectionMethod,
    currencyCode: agreement?.successFeeCurrencyCode,
    deductionAllowed: agreement?.successFeeDeductionAllowed,
    feeAmount: agreement?.successFeeAmount,
    hasStoredPaymentMethod: agreement?.successFeeHasStoredPaymentMethod,
    invoiceDueAt: agreement?.successFeeInvoiceDueAt,
    paymentAuthorizationState: agreement?.paymentAuthorizationState,
    recoveredAmount: agreement?.successFeeRecoveredAmount,
    resolvedAt: agreement?.successFeeResolvedAt,
    subscriptionId: agreement?.successFeeSubscriptionId ?? null,
  });
  const acceptedRecoveryPrerequisites = buildAcceptedRecoveryPrerequisitesSnapshot({
    commercialAgreement,
    commercialScope,
    recoveryDecisionStatus: recoveryDecision.status,
    successFeeCollection,
  });

  if (!acceptedRecoveryPrerequisites.collectionPathReady) {
    return {
      success: false,
      error: RECOVERY_COLLECTION_PATH_REQUIRED_ERROR,
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

      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
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
    currentStaffId: currentClaim.staffId,
    currentTitle: currentClaim.title,
    currentUserId: currentClaim.userId,
    deps,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    staffScopeWhere,
    tenantId,
    staffRecoveryPrerequisitesSatisfied: true,
  });
}

type ClaimsTransaction = {
  insert: typeof db.insert;
  select: typeof db.select;
  update: typeof db.update;
};

async function assignClaimToActingStaffIfUnassigned(params: {
  currentStaffId: string | null;
  session: ClaimsSession;
  staffScopeWhere: StaffScopeWhere;
  tenantId: string;
  tx: ClaimsTransaction;
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
      assignedAt: sql`coalesce(${claims.assignedAt}, ${now})`,
      assignedById: sql`coalesce(${claims.assignedById}, ${params.session.user.id})`,
    })
    .where(params.staffScopeWhere);
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

function scheduleStatusChangeNotification(params: {
  claimId: string;
  claimTitle: string;
  deps: ClaimsDeps;
  newStatus: ClaimStatus;
  oldStatus: ClaimStatus | null;
  tenantId: string;
  userId: string;
}) {
  const { claimId, claimTitle, deps, newStatus, oldStatus, tenantId, userId } = params;
  const notifyStatusChanged = deps.notifyStatusChanged;

  if (!notifyStatusChanged || !oldStatus || oldStatus === newStatus) {
    return;
  }

  void (async () => {
    try {
      const member = await db.query.user.findFirst({
        where: (userTable, { eq }) =>
          withTenant(tenantId, userTable.tenantId, eq(userTable.id, userId)),
        columns: {
          email: true,
        },
      });

      if (!member?.email) {
        return;
      }

      await notifyStatusChanged(
        userId,
        member.email,
        { id: claimId, title: claimTitle },
        oldStatus,
        newStatus,
        { tenantId }
      );
    } catch (error) {
      console.error('Failed to send status change notification:', error);
    }
  })();
}

async function finalizeClaimStatusChange(params: {
  auditMetadata?: Record<string, boolean | string | undefined>;
  beforePersist?: (tx: ClaimsTransaction) => Promise<void>;
  claimId: string;
  currentStatus: ClaimStatus | null;
  currentStaffId: string | null;
  currentTitle: string;
  currentUserId: string;
  deps: ClaimsDeps;
  isPublicChange: boolean;
  note?: string;
  staffRecoveryPrerequisitesSatisfied?: boolean;
  staffScopeWhere: StaffScopeWhere;
  requestHeaders?: Headers;
  session: ClaimsSession;
  status: ClaimStatus;
  tenantId: string;
}): Promise<ActionResult> {
  const { beforePersist, ...rest } = params;

  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
  const transitionResult = await db.transaction(async tx => {
    const result = await transitionClaimStatusInTransaction(
      tx as unknown as Parameters<typeof transitionClaimStatusInTransaction>[0],
      {
        actor: { id: rest.session.user.id, role: 'staff' },
        claimId: rest.claimId,
        isPublic: rest.isPublicChange,
        note: rest.note ?? null,
        requiredWhereCondition: rest.staffScopeWhere,
        staffRecoveryPrerequisitesSatisfied: rest.staffRecoveryPrerequisitesSatisfied,
        tenantId: rest.tenantId,
        toStatus: rest.status,
      }
    );

    if (!result.success) {
      return result;
    }

    if (beforePersist) {
      await beforePersist(tx);
    }

    await assignClaimToActingStaffIfUnassigned({
      currentStaffId: rest.currentStaffId,
      session: rest.session,
      staffScopeWhere: rest.staffScopeWhere,
      tenantId: rest.tenantId,
      tx,
    });

    return result;
  });

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

  await logClaimStatusAudit(sideEffectParams);

  if (sideEffectParams.isPublicChange) {
    scheduleStatusChangeNotification({
      claimId: sideEffectParams.claimId,
      claimTitle: sideEffectParams.currentTitle,
      deps: sideEffectParams.deps,
      newStatus: sideEffectParams.status,
      oldStatus: sideEffectParams.currentStatus,
      tenantId: sideEffectParams.tenantId,
      userId: sideEffectParams.currentUserId,
    });
  }

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

  const scopeArgs = resolveScopedStaffClaimAccess({ claimId, session });
  const tenantId = scopeArgs.tenantId;
  const staffScopeWhere = buildScopedStaffClaimWhere(scopeArgs);
  const trimmedNote = note?.trim() || undefined;
  const trimmedAllowanceOverrideReason = params.allowanceOverrideReason?.trim() || undefined;
  const trimmedDecisionExplanation = params.decisionExplanation?.trim() || undefined;

  try {
    // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
    const [currentClaim] = await db
      .select({
        category: claims.category,
        status: claims.status,
        title: claims.title,
        userId: claims.userId,
        staffId: claims.staffId,
      })
      .from(claims)
      .where(staffScopeWhere)
      .limit(1);

    if (!currentClaim) {
      return { success: false, error: STAFF_SCOPE_ACCESS_DENIED_ERROR };
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
        staffScopeWhere,
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
        currentStaffId: currentClaim.staffId,
        currentTitle: currentClaim.title,
        currentUserId: currentClaim.userId,
        deps,
        isPublicChange,
        note: publicDeclineNote,
        requestHeaders: params.requestHeaders,
        session,
        status,
        staffScopeWhere,
        tenantId,
      });
    }

    return finalizeClaimStatusChange({
      claimId,
      currentStatus: currentClaim.status,
      currentStaffId: currentClaim.staffId,
      currentTitle: currentClaim.title,
      currentUserId: currentClaim.userId,
      deps,
      isPublicChange,
      note: trimmedNote,
      requestHeaders: params.requestHeaders,
      session,
      status,
      staffScopeWhere,
      tenantId,
    });
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
