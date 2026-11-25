import { and, claims, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import {
  loadRecoveryInvariantReadRow,
  type EscalationAgreementEvidence,
} from './recovery-invariant-evidence';
import { evaluateRecoveryInvariants, needsRecoveryInvariantEvidence } from './recovery-invariants';
import { needsTransitionEvidenceRead } from './transition-evidence';
import { lockTransitionEvidence, transitionEvidenceGuardContext } from './transition-evidence-read';
import type {
  InvalidTransitionCurrentState,
  TransitionCurrentState,
} from './transition-current-state';
import { resolveTransitionCurrentState } from './transition-current-state';
import type { ClaimTransitionContext } from './transition-guard';
import type { TransitionTx } from './transition-side-effects';

export type TransitionReadContext = {
  current: TransitionCurrentState | InvalidTransitionCurrentState | undefined;
  guardContext: ClaimTransitionContext;
};

export type LockedTransitionInputs = {
  current: TransitionCurrentState;
  agreement: EscalationAgreementEvidence | undefined;
};

export function buildTransitionClaimWhere(params: {
  claimId: string;
  requiredWhereCondition?: SQLWrapper;
  tenantId: string;
}): SQL {
  const scopedWhere = and(
    eq(claims.tenantId, params.tenantId),
    eq(claims.id, params.claimId)
  ) as SQL;
  return (
    params.requiredWhereCondition ? and(scopedWhere, params.requiredWhereCondition) : scopedWhere
  ) as SQL;
}

export async function loadTransitionReadContext(
  tx: TransitionTx,
  readWhere: SQL,
  params: { claimId: string; tenantId: string; toStatus: ClaimStatus },
  locked?: LockedTransitionInputs
): Promise<TransitionReadContext> {
  if (locked?.current.status === params.toStatus) {
    return { current: locked.current, guardContext: {} };
  }
  if (needsRecoveryInvariantEvidence(params.toStatus)) {
    const row = await loadRecoveryInvariantReadRow(
      tx,
      { claimId: params.claimId, readWhere, tenantId: params.tenantId },
      locked
    );
    const proofs = needsTransitionEvidenceRead({
      claimCategory: row.current?.category,
      toStatus: params.toStatus,
    })
      ? await lockTransitionEvidence(tx, {
          claimId: params.claimId,
          tenantId: params.tenantId,
        })
      : [];

    return {
      current: row.current,
      guardContext: {
        paymentAuthorizationState: row.evidence?.paymentAuthorizationState ?? null,
        recoveryInvariantRejection: evaluateRecoveryInvariants({
          evidence: row.evidence,
          toStatus: params.toStatus,
        }),
        ...transitionEvidenceGuardContext({
          claimCategory: row.current?.category,
          evidence: row.evidence,
          proofs,
          toStatus: params.toStatus,
        }),
      },
    };
  }

  const [current] = locked
    ? []
    : await tx
        .select({
          caseLifecycleState: claims.caseLifecycleState,
          category: claims.category,
          lifecycleVersion: claims.lifecycleVersion,
          recoveryLifecycleState: claims.recoveryLifecycleState,
        })
        .from(claims)
        .where(readWhere)
        .limit(1);
  const category = locked?.current.category ?? current?.category;
  const proofs = needsTransitionEvidenceRead({
    claimCategory: category,
    toStatus: params.toStatus,
  })
    ? await lockTransitionEvidence(tx, {
        claimId: params.claimId,
        tenantId: params.tenantId,
      })
    : [];

  return {
    current: locked?.current ?? (current ? resolveTransitionCurrentState(current) : undefined),
    guardContext: {
      paymentAuthorizationState: null,
      recoveryInvariantRejection: null,
      ...transitionEvidenceGuardContext({
        claimCategory: category,
        evidence: null,
        proofs,
        toStatus: params.toStatus,
      }),
    },
  };
}
