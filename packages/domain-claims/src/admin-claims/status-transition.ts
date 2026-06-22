import {
  and,
  claimEscalationAgreements,
  claims,
  db,
  eq,
  isNull,
  sql,
} from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';

import {
  transitionClaimStatusInTransaction,
  type TransitionClaimStatusResult,
} from '../claims/transition';
import type { ClaimLifecycleReadProjection } from '../claims/lifecycle-read-model';
import type { CaseLifecycleState, RecoveryLifecycleState } from '../claims/lifecycle-state';
import type { ClaimTransitionActor } from '../claims/transition-guard';

const paymentGatedStatuses = new Set<ClaimStatus>(['negotiation', 'court']);

export type TransitionAdminClaimStatusParams = {
  actor: ClaimTransitionActor;
  expectedCaseLifecycleState: CaseLifecycleState;
  expectedLifecycleAuthority: ClaimLifecycleReadProjection['authority'];
  expectedRecoveryLifecycleState: RecoveryLifecycleState;
  expectedStatus: ClaimStatus;
  claimId: string;
  tenantId: string;
  toStatus: ClaimStatus;
};

function paymentAuthorizationRequired(params: { claimId: string; tenantId: string }): SQLWrapper {
  return sql`exists (
    select 1 from ${claimEscalationAgreements}
    where ${claimEscalationAgreements.tenantId} = ${params.tenantId}
      and ${claimEscalationAgreements.claimId} = ${params.claimId}
      and ${claimEscalationAgreements.paymentAuthorizationState} = 'authorized'
  )`;
}

function expectedFromStateCondition(params: TransitionAdminClaimStatusParams): SQLWrapper {
  if (params.expectedLifecycleAuthority === 'status_fallback') {
    return and(
      isNull(claims.caseLifecycleState),
      isNull(claims.recoveryLifecycleState),
      eq(claims.status, params.expectedStatus)
    ) as SQLWrapper;
  }

  return and(
    eq(claims.caseLifecycleState, params.expectedCaseLifecycleState),
    eq(claims.recoveryLifecycleState, params.expectedRecoveryLifecycleState)
  ) as SQLWrapper;
}

function requiredTransitionCondition(params: TransitionAdminClaimStatusParams): SQLWrapper {
  const fromStateCondition = expectedFromStateCondition(params);
  if (!paymentGatedStatuses.has(params.toStatus)) return fromStateCondition;

  return and(
    fromStateCondition,
    paymentAuthorizationRequired({ claimId: params.claimId, tenantId: params.tenantId })
  ) as SQLWrapper;
}

export async function transitionAdminClaimStatus(
  params: TransitionAdminClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  // db-access-guard: tenant-scoped -- reason: transition helper applies tenant-scoped CAS.
  return db.transaction(tx =>
    transitionClaimStatusInTransaction(tx, {
      actor: params.actor,
      claimId: params.claimId,
      requiredWhereCondition: requiredTransitionCondition(params),
      tenantId: params.tenantId,
      toStatus: params.toStatus,
    })
  );
}
