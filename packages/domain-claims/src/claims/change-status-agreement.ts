import {
  and,
  claimEscalationAgreements,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';

const agreements = claimEscalationAgreements;

export async function lockClaimStatusAgreement(
  tx: TenantTransaction,
  tenantId: string,
  claimId: string
) {
  const [agreement] = await tx
    .select({
      acceptedAt: agreements.acceptedAt,
      decisionNextStatus: agreements.decisionNextStatus,
      decisionReason: agreements.decisionReason,
      decisionType: agreements.decisionType,
      declineReasonCode: agreements.declineReasonCode,
      feePercentage: agreements.feePercentage,
      legalActionCapPercentage: agreements.legalActionCapPercentage,
      minimumFee: agreements.minimumFee,
      paymentAuthorizationState: agreements.paymentAuthorizationState,
      signedAt: agreements.signedAt,
      successFeeAmount: agreements.successFeeAmount,
      successFeeCollectionMethod: agreements.successFeeCollectionMethod,
      successFeeCurrencyCode: agreements.successFeeCurrencyCode,
      successFeeDeductionAllowed: agreements.successFeeDeductionAllowed,
      successFeeHasStoredPaymentMethod: agreements.successFeeHasStoredPaymentMethod,
      successFeeInvoiceDueAt: agreements.successFeeInvoiceDueAt,
      successFeeRecoveredAmount: agreements.successFeeRecoveredAmount,
      successFeeResolvedAt: agreements.successFeeResolvedAt,
      successFeeSubscriptionId: agreements.successFeeSubscriptionId,
      termsVersion: agreements.termsVersion,
    })
    .from(agreements)
    .where(and(eq(agreements.tenantId, tenantId), eq(agreements.claimId, claimId)))
    .limit(1)
    .for('share');
  return agreement;
}

export type LockedClaimStatusAgreement = NonNullable<
  Awaited<ReturnType<typeof lockClaimStatusAgreement>>
>;
