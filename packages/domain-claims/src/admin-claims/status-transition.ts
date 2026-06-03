import { and, claimEscalationAgreements, claims, db, eq, sql } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { SQLWrapper } from 'drizzle-orm';

import {
  transitionClaimStatusInTransaction,
  type TransitionClaimStatusResult,
} from '../claims/transition';
import type { ClaimTransitionActor } from '../claims/transition-guard';

const paymentGatedStatuses = new Set<ClaimStatus>(['negotiation', 'court']);

export type TransitionAdminClaimStatusParams = {
  actor: ClaimTransitionActor;
  claimId: string;
  fromStatus: ClaimStatus;
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

function requiredTransitionCondition(params: TransitionAdminClaimStatusParams): SQLWrapper {
  const fromStatusCondition = eq(claims.status, params.fromStatus);
  if (!paymentGatedStatuses.has(params.toStatus)) return fromStatusCondition;

  return and(
    fromStatusCondition,
    paymentAuthorizationRequired({ claimId: params.claimId, tenantId: params.tenantId })
  ) as SQLWrapper;
}

export async function transitionAdminClaimStatus(
  params: TransitionAdminClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  const requiresPaymentAuthorization = paymentGatedStatuses.has(params.toStatus);

  // db-access-guard: tenant-scoped -- reason: transition helper applies tenant-scoped CAS.
  return db.transaction(tx =>
    transitionClaimStatusInTransaction(tx, {
      actor: params.actor,
      claimId: params.claimId,
      ...(requiresPaymentAuthorization ? { paymentAuthorizationState: 'authorized' as const } : {}),
      requiredWhereCondition: requiredTransitionCondition(params),
      tenantId: params.tenantId,
      toStatus: params.toStatus,
    })
  );
}
