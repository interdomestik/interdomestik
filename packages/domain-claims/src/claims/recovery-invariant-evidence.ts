import { claims, sql } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';
import type { TransitionTx } from './transition-side-effects';
import type { RecoveryInvariantEvidence } from './recovery-invariants';
import type {
  InvalidTransitionCurrentState,
  TransitionCurrentState,
} from './transition-current-state';
import { resolveTransitionCurrentState } from './transition-current-state';

export type RecoveryInvariantReadRow = {
  current: TransitionCurrentState | InvalidTransitionCurrentState | undefined;
  evidence: RecoveryInvariantEvidence | null;
};

type EscalationAgreementEvidence = Pick<
  RecoveryInvariantEvidence,
  | 'legalActionCapPercentage'
  | 'paymentAuthorizationState'
  | 'signedAt'
  | 'successFeeAmount'
  | 'successFeeCollectionMethod'
  | 'successFeeCurrencyCode'
  | 'successFeeDeductionAllowed'
  | 'successFeeHasStoredPaymentMethod'
  | 'successFeeInvoiceDueAt'
  | 'successFeeRecoveredAmount'
  | 'successFeeResolvedAt'
  | 'successFeeSubscriptionId'
>;
type NoFeeEvidence = Pick<
  RecoveryInvariantEvidence,
  'noFeeDocumentedAt' | 'noFeeDocumentedById' | 'noFeeReasonCode'
>;

async function lockEscalationAgreementEvidence(
  tx: TransitionTx,
  params: { claimId: string; tenantId: string }
): Promise<EscalationAgreementEvidence | undefined> {
  const [row] = await tx.execute<EscalationAgreementEvidence>(sql`
    select
      "legal_action_cap_percentage" as "legalActionCapPercentage",
      "payment_authorization_state" as "paymentAuthorizationState",
      "signed_at" as "signedAt",
      "success_fee_amount" as "successFeeAmount",
      "success_fee_collection_method" as "successFeeCollectionMethod",
      "success_fee_currency_code" as "successFeeCurrencyCode",
      "success_fee_deduction_allowed" as "successFeeDeductionAllowed",
      "success_fee_has_stored_payment_method" as "successFeeHasStoredPaymentMethod",
      "success_fee_invoice_due_at" as "successFeeInvoiceDueAt",
      "success_fee_recovered_amount" as "successFeeRecoveredAmount",
      "success_fee_resolved_at" as "successFeeResolvedAt",
      "success_fee_subscription_id" as "successFeeSubscriptionId"
    from "claim_escalation_agreements"
    where "tenant_id" = ${params.tenantId}
      and "claim_id" = ${params.claimId}
    order by "updated_at" desc, "id" desc
    limit 1
    for update
  `);

  return row;
}

async function lockNoFeeEvidence(
  tx: TransitionTx,
  params: { claimId: string; tenantId: string }
): Promise<NoFeeEvidence | undefined> {
  const [row] = await tx.execute<NoFeeEvidence>(sql`
    select
      "documented_at" as "noFeeDocumentedAt",
      "documented_by_id" as "noFeeDocumentedById",
      "reason_code" as "noFeeReasonCode"
    from "claim_recovery_no_fee_evidence"
    where "tenant_id" = ${params.tenantId}
      and "claim_id" = ${params.claimId}
    order by "updated_at" desc, "id" desc
    limit 1
    for update
  `);

  return row;
}

export async function loadRecoveryInvariantReadRow(
  tx: TransitionTx,
  params: { claimId: string; readWhere: SQL; tenantId: string }
): Promise<RecoveryInvariantReadRow> {
  // Canonical recovery prerequisite lock order: agreement evidence, then no-fee evidence.
  const agreement = await lockEscalationAgreementEvidence(tx, params);
  const noFee = await lockNoFeeEvidence(tx, params);
  const [current] = await tx
    .select({
      caseLifecycleState: claims.caseLifecycleState,
      lifecycleVersion: claims.lifecycleVersion,
      recoveryLifecycleState: claims.recoveryLifecycleState,
    })
    .from(claims)
    .where(params.readWhere)
    .limit(1);

  if (!current) return { current: undefined, evidence: null };

  return {
    current: resolveTransitionCurrentState(current),
    evidence: { claimId: params.claimId, ...agreement, ...noFee },
  };
}
