import { and, claims, eq } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { withTenant } from '@interdomestik/database/tenant-security';
import type { SQL, SQLWrapper } from 'drizzle-orm';
import { loadRecoveryInvariantReadRow } from './recovery-invariant-evidence';
import { evaluateRecoveryInvariants, needsRecoveryInvariantEvidence } from './recovery-invariants';
import type { ClaimTransitionContext } from './transition-guard';
import type { TransitionTx } from './transition-side-effects';

export type TransitionReadContext = {
  current:
    | {
        lifecycleVersion: number;
        status: ClaimStatus | string | null;
      }
    | undefined;
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
  const scopedWhere = withTenant(params.tenantId, claims.tenantId, eq(claims.id, params.claimId));
  const readWhere: SQL = (
    params.requiredWhereCondition ? and(scopedWhere, params.requiredWhereCondition) : scopedWhere
  )!;

  if (needsRecoveryInvariantEvidence(params.toStatus)) {
    const row = await loadRecoveryInvariantReadRow(tx, {
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
      lifecycleVersion: claims.lifecycleVersion,
      status: claims.status,
    })
    .from(claims)
    .where(readWhere)
    .limit(1);

  return {
    current,
    guardContext: {
      paymentAuthorizationState: null,
      recoveryInvariantRejection: null,
    },
    readWhere,
  };
}
