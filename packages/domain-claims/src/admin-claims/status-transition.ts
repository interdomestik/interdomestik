import { and, claimEscalationAgreements, claims, eq, sql } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import type { SQLWrapper } from 'drizzle-orm';

import {
  transitionClaimStatusInTransaction,
  type TransitionClaimStatusResult,
  type TransitionTx,
} from '../claims/transition';
import type { ClaimLifecycleReadProjection } from '../claims/lifecycle-read-model';
import type { CaseLifecycleState, RecoveryLifecycleState } from '../claims/lifecycle-state';
import type { ClaimTransitionActor } from '../claims/transition-guard';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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

// Runs the canonical admin status transition on the caller's supplied transaction (for example a
// tenant-context transaction that also writes the operational audit). It opens no transaction.
export async function transitionAdminClaimStatusInTransaction(
  tx: TransitionTx,
  params: TransitionAdminClaimStatusParams
): Promise<TransitionClaimStatusResult> {
  return transitionClaimStatusInTransaction(tx, {
    actor: params.actor,
    claimId: params.claimId,
    requiredWhereCondition: requiredTransitionCondition(params),
    tenantId: params.tenantId,
    toStatus: params.toStatus,
  });
}

export async function transitionAdminClaimStatus(
  params: Omit<TransitionAdminClaimStatusParams, 'tenantId'> & { authority: TenantAuthority }
): Promise<TransitionClaimStatusResult> {
  const { authority, ...transitionParams } = params;
  const { tenantId } = readTenantAuthority(authority);
  // db-access-guard: tenant-scoped -- reason: transition helper applies tenant-scoped CAS.
  return withTenantAuthority(authority, tx =>
    transitionAdminClaimStatusInTransaction(tx, { ...transitionParams, tenantId })
  );
}
