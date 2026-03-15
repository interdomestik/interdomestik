import { and, claimEscalationAgreements, claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import {
  buildAcceptedRecoveryPrerequisitesSnapshot,
  buildCommercialAgreementSnapshot,
  buildSuccessFeeCollectionSnapshot,
} from './accepted-recovery-prerequisites';
import { buildCommercialHandlingScopeSnapshot } from './commercial-handling-scope';
import { getMatterAllowanceVisibilityForUser } from './matter-allowance';
import { buildRecoveryDecisionSnapshot } from './recovery-decision';
import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  ClaimEscalationAgreementSnapshot,
  RecoveryDecisionSnapshot,
} from './types';

export type StaffClaimDetail = {
  claim: {
    id: string;
    claimNumber: string | null;
    status: string | null;
    staffId: string | null;
    stageLabel: string;
    submittedAt: string | null;
    updatedAt: string | null;
  };
  member: {
    id: string;
    fullName: string;
    membershipNumber: string | null;
  };
  matterAllowance: {
    allowanceTotal: number;
    consumedCount: number;
    remainingCount: number;
    windowStart: string;
    windowEnd: string;
  } | null;
  agent?: {
    id: string;
    name: string;
  };
  acceptedRecoveryPrerequisites: AcceptedRecoveryPrerequisitesSnapshot;
  recoveryDecision: RecoveryDecisionSnapshot;
  commercialAgreement: ClaimEscalationAgreementSnapshot | null;
  successFeeCollection: import('./types').SuccessFeeCollectionSnapshot | null;
};

function formatStageLabel(status: string | null | undefined) {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getStaffClaimDetail(params: {
  staffId: string;
  tenantId: string;
  claimId: string;
}): Promise<StaffClaimDetail | null> {
  const { tenantId, claimId } = params;

  const rows = await db
    .select({
      claimId: claims.id,
      claimCategory: claims.category,
      claimNumber: claims.claimNumber,
      status: claims.status,
      staffId: claims.staffId,
      updatedAt: claims.updatedAt,
      createdAt: claims.createdAt,
      agentId: claims.agentId,
      memberId: user.id,
      memberName: user.name,
      memberNumber: user.memberNumber,
      agreementDecisionType: claimEscalationAgreements.decisionType,
      agreementDeclineReasonCode: claimEscalationAgreements.declineReasonCode,
      agreementDecisionNextStatus: claimEscalationAgreements.decisionNextStatus,
      agreementDecisionReason: claimEscalationAgreements.decisionReason,
      agreementFeePercentage: claimEscalationAgreements.feePercentage,
      agreementMinimumFee: claimEscalationAgreements.minimumFee,
      agreementLegalActionCapPercentage: claimEscalationAgreements.legalActionCapPercentage,
      agreementPaymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
      agreementSuccessFeeRecoveredAmount: claimEscalationAgreements.successFeeRecoveredAmount,
      agreementSuccessFeeCurrencyCode: claimEscalationAgreements.successFeeCurrencyCode,
      agreementSuccessFeeAmount: claimEscalationAgreements.successFeeAmount,
      agreementSuccessFeeCollectionMethod: claimEscalationAgreements.successFeeCollectionMethod,
      agreementSuccessFeeDeductionAllowed: claimEscalationAgreements.successFeeDeductionAllowed,
      agreementSuccessFeeHasStoredPaymentMethod:
        claimEscalationAgreements.successFeeHasStoredPaymentMethod,
      agreementSuccessFeeInvoiceDueAt: claimEscalationAgreements.successFeeInvoiceDueAt,
      agreementSuccessFeeResolvedAt: claimEscalationAgreements.successFeeResolvedAt,
      agreementSuccessFeeSubscriptionId: claimEscalationAgreements.successFeeSubscriptionId,
      agreementTermsVersion: claimEscalationAgreements.termsVersion,
      agreementSignedAt: claimEscalationAgreements.signedAt,
      agreementAcceptedAt: claimEscalationAgreements.acceptedAt,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .leftJoin(claimEscalationAgreements, eq(claims.id, claimEscalationAgreements.claimId))
    .where(withTenant(tenantId, claims.tenantId, and(eq(claims.id, claimId))))
    .limit(1);

  const row = rows[0];
  if (!row || !row.memberId || !row.memberName) return null;

  let agent: StaffClaimDetail['agent'];
  if (row.agentId) {
    const agentRows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(withTenant(tenantId, user.tenantId, eq(user.id, row.agentId)))
      .limit(1);
    const agentRow = agentRows[0];
    if (agentRow?.id && agentRow.name) {
      agent = { id: agentRow.id, name: agentRow.name };
    }
  }

  const matterAllowance = await getMatterAllowanceVisibilityForUser({
    tenantId,
    userId: row.memberId,
  });
  const recoveryDecision = buildRecoveryDecisionSnapshot({
    decidedAt: row.agreementAcceptedAt,
    declineReasonCode: row.agreementDeclineReasonCode ?? null,
    decisionType: row.agreementDecisionType ?? null,
    explanation: row.agreementDecisionReason ?? null,
  });
  const commercialAgreement = buildCommercialAgreementSnapshot({
    acceptedAt: row.agreementAcceptedAt,
    claimId: row.claimId,
    decisionNextStatus: row.agreementDecisionNextStatus ?? null,
    decisionReason: row.agreementDecisionReason ?? null,
    feePercentage: row.agreementFeePercentage,
    legalActionCapPercentage: row.agreementLegalActionCapPercentage,
    minimumFee: row.agreementMinimumFee,
    paymentAuthorizationState: row.agreementPaymentAuthorizationState,
    signedAt: row.agreementSignedAt,
    termsVersion: row.agreementTermsVersion,
  });
  const successFeeCollection = buildSuccessFeeCollectionSnapshot({
    claimId: row.claimId,
    collectionMethod: row.agreementSuccessFeeCollectionMethod,
    currencyCode: row.agreementSuccessFeeCurrencyCode,
    deductionAllowed: row.agreementSuccessFeeDeductionAllowed,
    feeAmount: row.agreementSuccessFeeAmount,
    hasStoredPaymentMethod: row.agreementSuccessFeeHasStoredPaymentMethod,
    invoiceDueAt: row.agreementSuccessFeeInvoiceDueAt,
    paymentAuthorizationState: row.agreementPaymentAuthorizationState,
    recoveredAmount: row.agreementSuccessFeeRecoveredAmount,
    resolvedAt: row.agreementSuccessFeeResolvedAt,
    subscriptionId: row.agreementSuccessFeeSubscriptionId ?? null,
  });
  const commercialScope = buildCommercialHandlingScopeSnapshot({
    claimCategory: row.claimCategory,
  });
  const acceptedRecoveryPrerequisites = buildAcceptedRecoveryPrerequisitesSnapshot({
    commercialAgreement,
    commercialScope,
    recoveryDecisionStatus: recoveryDecision.status,
    successFeeCollection,
  });

  return {
    claim: {
      id: row.claimId,
      claimNumber: row.claimNumber,
      status: row.status,
      staffId: row.staffId ?? null,
      stageLabel: formatStageLabel(row.status),
      submittedAt: normalizeDate(row.createdAt),
      updatedAt: normalizeDate(row.updatedAt ?? row.createdAt),
    },
    member: {
      id: row.memberId,
      fullName: row.memberName,
      membershipNumber: row.memberNumber ?? null,
    },
    matterAllowance: matterAllowance
      ? {
          allowanceTotal: matterAllowance.allowanceTotal,
          consumedCount: matterAllowance.consumedCount,
          remainingCount: matterAllowance.remainingCount,
          windowStart: matterAllowance.windowStart.toISOString(),
          windowEnd: matterAllowance.windowEnd.toISOString(),
        }
      : null,
    agent,
    acceptedRecoveryPrerequisites,
    recoveryDecision,
    commercialAgreement,
    successFeeCollection,
  };
}
