import { and, claims, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { loadRecoveryInvariantReadRow } from './recovery-invariant-evidence';
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
  readWhere: SQLWrapper;
};

export async function loadTransitionReadContext(
  tx: TransitionTx,
  params: {
    claimId: string;
    requiredWhereCondition?: SQLWrapper;
    tenantId: string;
    toStatus: ClaimStatus;
  }
): Promise<TransitionReadContext> {
  const scopedWhere = and(
    eq(claims.tenantId, params.tenantId),
    eq(claims.id, params.claimId)
  ) as SQL;
  const readWhere = (
    params.requiredWhereCondition ? and(scopedWhere, params.requiredWhereCondition) : scopedWhere
  ) as SQL;
  if (needsRecoveryInvariantEvidence(params.toStatus)) {
    const row = await loadRecoveryInvariantReadRow(tx, {
      claimId: params.claimId,
      readWhere,
      tenantId: params.tenantId,
    });
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
      readWhere,
    };
  }

  const [current] = await tx
    .select({
      caseLifecycleState: claims.caseLifecycleState,
      category: claims.category,
      lifecycleVersion: claims.lifecycleVersion,
      recoveryLifecycleState: claims.recoveryLifecycleState,
      status: claims.status,
    })
    .from(claims)
    .where(readWhere)
    .limit(1);
  const proofs = needsTransitionEvidenceRead({
    claimCategory: current?.category,
    toStatus: params.toStatus,
  })
    ? await lockTransitionEvidence(tx, {
        claimId: params.claimId,
        tenantId: params.tenantId,
      })
    : [];

  return {
    current: current ? resolveTransitionCurrentState(current) : undefined,
    guardContext: {
      paymentAuthorizationState: null,
      recoveryInvariantRejection: null,
      ...transitionEvidenceGuardContext({
        claimCategory: current?.category,
        evidence: null,
        proofs,
        toStatus: params.toStatus,
      }),
    },
    readWhere,
  };
}
