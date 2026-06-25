import { sql } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';

import type { RecoveryInvariantEvidence } from './recovery-invariants';
import {
  evaluateTransitionEvidence,
  evidenceSummary,
  type TransitionEvidenceProof,
} from './transition-evidence';
import type { ClaimTransitionContext } from './transition-guard';
import type { TransitionTx } from './transition-side-effects';

function hasAcceptedFeeEvidence(evidence: RecoveryInvariantEvidence | null): boolean {
  return Boolean(
    evidence?.acceptedAt && evidence.signedAt && evidence.paymentAuthorizationState === 'authorized'
  );
}

export async function lockTransitionEvidence(
  tx: TransitionTx,
  params: { claimId: string; tenantId: string }
): Promise<TransitionEvidenceProof[]> {
  const rows = await tx.execute<TransitionEvidenceProof>(sql`
    select
      "id",
      "evidence_status" as "evidenceStatus",
      "evidence_type" as "evidenceType"
    from "claim_transition_evidence"
    where coalesce("access_tenant_id", "tenant_id") = ${params.tenantId}
      and "claim_id" = ${params.claimId}
      and "evidence_status" <> 'revoked'
    order by "evidence_type" asc, "recorded_at" desc, "id" desc
    for update
  `);

  return rows;
}

export function transitionEvidenceGuardContext(params: {
  claimCategory?: string | null;
  evidence: RecoveryInvariantEvidence | null;
  proofs: readonly TransitionEvidenceProof[];
  toStatus: ClaimStatus;
}): Pick<ClaimTransitionContext, 'transitionEvidenceRejection' | 'transitionEvidenceSummary'> {
  return {
    transitionEvidenceRejection: evaluateTransitionEvidence({
      acceptedFeeEvidence: hasAcceptedFeeEvidence(params.evidence),
      claimCategory: params.claimCategory,
      proofs: params.proofs,
      toStatus: params.toStatus,
    }),
    transitionEvidenceSummary: evidenceSummary(params.proofs),
  };
}
