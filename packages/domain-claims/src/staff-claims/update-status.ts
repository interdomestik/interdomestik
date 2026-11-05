import {
  claimEscalationAgreements,
  claims,
  eq,
  serviceUsage,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
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
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import {
  getMatterAllowanceContextForSubscription,
  getMatterAllowanceSubscriptionContextForUser,
  getRecoveryMatterServiceCode,
  hasRecoveryMatterUsageForClaim,
} from './matter-allowance';
import { buildRecoveryDecisionSnapshot, getRecoveryDeclinePublicNote } from './recovery-decision';
import { upsertRecoveryDecisionRecord } from './recovery-decision-record';
import { safePublicStatusNote } from './rejected-claim-public-note';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';
import {
  finalizeClaimStatusChange,
  type RecoveryStatusChangeParams,
  type StaffScopeWhere,
  type StatusChangeResult,
} from './finalize-status-change';
import { scheduleStatusChangeNotification } from './update-status-notification';
import { loadStaffCurrentClaimRecord, type CurrentClaimRecord } from './current-claim-record';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
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
  authority: TenantAuthority | null;
  claimId: string;
  declineReasonCode?: RecoveryDeclineReasonCode;
  decisionExplanation?: string;
  hostId?: string | null;
  newStatus: string;
  note?: string;
  allowanceOverrideReason?: string;
  isPublicChange?: boolean;
  session: ClaimsSession | null;
  requestHeaders?: Headers;
};
async function handleStaffLedRecoveryStatusChange(
  params: RecoveryStatusChangeParams
): Promise<StatusChangeResult> {
  const {
    authority,
    tx,
    claimId,
    currentClaim,
    deps,
    hostId,
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
  const [agreement] = await tx
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
    tx,
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
  const matterAllowanceContext = await getMatterAllowanceContextForSubscription({
    tx,
    subscription: matterAllowanceSubscription,
    tenantId,
  });
  const alreadyConsumedForClaim = await hasRecoveryMatterUsageForClaim({
    tx,
    claimId,
    subscriptionId: matterAllowanceSubscription.subscriptionId,
    tenantId,
  });

  if (
    !alreadyConsumedForClaim &&
    matterAllowanceContext.consumedCount >= matterAllowanceContext.allowanceTotal &&
    !trimmedAllowanceOverrideReason
  ) {
    return { success: false, error: RECOVERY_ALLOWANCE_EXHAUSTED_ERROR };
  }

  return finalizeClaimStatusChange({
    authority,
    tx,
    matterUsage: alreadyConsumedForClaim
      ? undefined
      : {
          serviceCode: matterServiceCode,
          subscriptionId: matterAllowanceSubscription.subscriptionId,
          userId: currentClaim.userId,
        },
    recoveryDecline: undefined,
    claimId,
    currentStatus: currentClaim.status,
    currentStaffId: currentClaim.staffId,
    currentTitle: currentClaim.title,
    currentUserId: currentClaim.userId,
    deps,
    hostId,
    isPublicChange,
    note,
    requestHeaders,
    session,
    status,
    staffScopeWhere,
    tenantId,
  });
}
export async function updateClaimStatusCore(
  params: UpdateClaimStatusParams,
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { authority, claimId, newStatus, note, isPublicChange = true, session } = params;

  if (!authority || session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }
  // Validate status
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status' };
  }
  const status = parsed.data.status as ClaimStatus; // NOSONAR
  const { tenantId } = readTenantAuthority(authority);
  const scopeArgs = { ...resolveScopedStaffClaimAccess({ claimId, session }), tenantId };
  const staffScopeWhere = buildScopedStaffClaimWhere(scopeArgs);
  const trimmedNote = note?.trim() || undefined;
  const trimmedAllowanceOverrideReason = params.allowanceOverrideReason?.trim() || undefined;
  const trimmedDecisionExplanation = params.decisionExplanation?.trim() || undefined;
  try {
    const result = await withTenantAuthority(authority, async tx => {
      const currentClaimResult = await loadStaffCurrentClaimRecord(tx, staffScopeWhere);
      if (currentClaimResult.status === 'not_found') {
        return { success: false, error: STAFF_SCOPE_ACCESS_DENIED_ERROR };
      }
      if (currentClaimResult.status === 'invalid_current_status') {
        return { success: false, error: 'Invalid current claim status' };
      }
      const { currentClaim } = currentClaimResult;

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
          authority,
          tx,
          claimId,
          currentClaim,
          deps,
          hostId: params.hostId,
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
        const publicDeclineNote = isPublicChange
          ? getRecoveryDeclinePublicNote(params.declineReasonCode, trimmedNote)
          : trimmedNote;

        return finalizeClaimStatusChange({
          authority,
          tx,
          matterUsage: undefined,
          recoveryDecline: {
            declineReasonCode: params.declineReasonCode,
            explanation: trimmedDecisionExplanation,
          },
          claimId,
          currentStatus: currentClaim.status,
          currentStaffId: currentClaim.staffId,
          currentTitle: currentClaim.title,
          currentUserId: currentClaim.userId,
          deps,
          hostId: params.hostId,
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
        authority,
        tx,
        matterUsage: undefined,
        recoveryDecline: undefined,
        claimId,
        currentStatus: currentClaim.status,
        currentStaffId: currentClaim.staffId,
        currentTitle: currentClaim.title,
        currentUserId: currentClaim.userId,
        deps,
        hostId: params.hostId,
        isPublicChange,
        note: trimmedNote,
        requestHeaders: params.requestHeaders,
        session,
        status,
        staffScopeWhere,
        tenantId,
      });
    });
    if (result.success) await result.afterCommit?.();
    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('Failed to update claim status:', error);
    return { success: false, error: 'Failed to update claim status' };
  }
}
