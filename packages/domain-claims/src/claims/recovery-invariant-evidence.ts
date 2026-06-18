import {
  and,
  claimEscalationAgreements,
  claimRecoveryNoFeeEvidence,
  claims,
  eq,
} from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQL } from 'drizzle-orm';
import type { TransitionTx } from './transition-side-effects';
import type { RecoveryInvariantEvidence } from './recovery-invariants';

export type RecoveryInvariantReadRow = {
  current:
    | {
        lifecycleVersion: number;
        status: ClaimStatus | null;
      }
    | undefined;
  evidence: RecoveryInvariantEvidence | null;
};

export async function loadRecoveryInvariantReadRow(
  tx: TransitionTx,
  params: { readWhere: SQL; tenantId: string }
): Promise<RecoveryInvariantReadRow> {
  const [row] = await tx
    .select({
      claimId: claims.id,
      lifecycleVersion: claims.lifecycleVersion,
      legalActionCapPercentage: claimEscalationAgreements.legalActionCapPercentage,
      noFeeDocumentedAt: claimRecoveryNoFeeEvidence.documentedAt,
      noFeeDocumentedById: claimRecoveryNoFeeEvidence.documentedById,
      noFeeReasonCode: claimRecoveryNoFeeEvidence.reasonCode,
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
      status: claims.status,
    })
    .from(claims)
    .leftJoin(
      claimEscalationAgreements,
      and(
        eq(claimEscalationAgreements.tenantId, params.tenantId),
        eq(claimEscalationAgreements.claimId, claims.id)
      )
    )
    .leftJoin(
      claimRecoveryNoFeeEvidence,
      and(
        eq(claimRecoveryNoFeeEvidence.tenantId, params.tenantId),
        eq(claimRecoveryNoFeeEvidence.claimId, claims.id)
      )
    )
    .where(params.readWhere)
    .limit(1);

  if (!row) return { current: undefined, evidence: null };

  return {
    current: {
      lifecycleVersion: row.lifecycleVersion,
      status: row.status,
    },
    evidence: row,
  };
}
