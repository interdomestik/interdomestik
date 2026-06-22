import { and, claims, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { loadRecoveryInvariantReadRow } from './recovery-invariant-evidence';
import { evaluateRecoveryInvariants, needsRecoveryInvariantEvidence } from './recovery-invariants';
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

    return {
      current: row.current,
      guardContext: {
        paymentAuthorizationState: row.evidence?.paymentAuthorizationState ?? null,
        recoveryInvariantRejection: evaluateRecoveryInvariants({
          evidence: row.evidence,
          toStatus: params.toStatus,
        }),
      },
      readWhere,
    };
  }

  const [current] = await tx
    .select({
      caseLifecycleState: claims.caseLifecycleState,
      lifecycleVersion: claims.lifecycleVersion,
      recoveryLifecycleState: claims.recoveryLifecycleState,
    })
    .from(claims)
    .where(readWhere)
    .limit(1);

  return {
    current: current ? resolveTransitionCurrentState(current) : undefined,
    guardContext: {
      paymentAuthorizationState: null,
      recoveryInvariantRejection: null,
    },
    readWhere,
  };
}
