import { and, claimEscalationAgreements, claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { ClaimEscalationAgreementSnapshot } from './types';

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
  agent?: {
    id: string;
    name: string;
  };
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
      claimNumber: claims.claimNumber,
      status: claims.status,
      staffId: claims.staffId,
      updatedAt: claims.updatedAt,
      createdAt: claims.createdAt,
      agentId: claims.agentId,
      memberId: user.id,
      memberName: user.name,
      memberNumber: user.memberNumber,
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
    agent,
    commercialAgreement:
      row.agreementFeePercentage != null &&
      row.agreementMinimumFee != null &&
      row.agreementLegalActionCapPercentage != null &&
      row.agreementPaymentAuthorizationState != null &&
      row.agreementTermsVersion != null
        ? {
            claimId: row.claimId,
            decisionNextStatus: row.agreementDecisionNextStatus ?? null,
            decisionReason: row.agreementDecisionReason ?? null,
            feePercentage: row.agreementFeePercentage,
            minimumFee: row.agreementMinimumFee,
            legalActionCapPercentage: row.agreementLegalActionCapPercentage,
            paymentAuthorizationState: row.agreementPaymentAuthorizationState,
            signedAt: normalizeDate(row.agreementSignedAt),
            acceptedAt: normalizeDate(row.agreementAcceptedAt),
            termsVersion: row.agreementTermsVersion,
          }
        : null,
    successFeeCollection:
      row.agreementSuccessFeeRecoveredAmount != null &&
      row.agreementSuccessFeeCurrencyCode != null &&
      row.agreementSuccessFeeAmount != null &&
      row.agreementSuccessFeeCollectionMethod != null &&
      row.agreementSuccessFeeDeductionAllowed != null &&
      row.agreementSuccessFeeHasStoredPaymentMethod != null &&
      row.agreementPaymentAuthorizationState != null
        ? {
            claimId: row.claimId,
            recoveredAmount: row.agreementSuccessFeeRecoveredAmount,
            currencyCode: row.agreementSuccessFeeCurrencyCode,
            feeAmount: row.agreementSuccessFeeAmount,
            collectionMethod: row.agreementSuccessFeeCollectionMethod,
            deductionAllowed: row.agreementSuccessFeeDeductionAllowed,
            hasStoredPaymentMethod: row.agreementSuccessFeeHasStoredPaymentMethod,
            invoiceDueAt: normalizeDate(row.agreementSuccessFeeInvoiceDueAt),
            paymentAuthorizationState: row.agreementPaymentAuthorizationState,
            resolvedAt: normalizeDate(row.agreementSuccessFeeResolvedAt),
            subscriptionId: row.agreementSuccessFeeSubscriptionId ?? null,
          }
        : null,
  };
}
