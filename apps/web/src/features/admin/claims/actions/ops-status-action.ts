import { withTenantContext } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { resolveClaimLifecycleReadProjection } from '@interdomestik/domain-claims';
import { transitionAdminClaimStatusInTransaction } from '@interdomestik/domain-claims/admin-claims/status-transition';
import { isClaimStatus } from '@interdomestik/domain-claims/claims/transition-guard';

import {
  assertCanMutateClaim,
  assertTransitionAllowed,
  getClaimForMutation,
  getOpsMutationContext,
  logAudit,
  type OpsActionResponse,
  revalidateClaim,
} from './action-helpers';
import {
  completeCommittedOpsAction,
  OPS_ACTION_UNAUTHORIZED_ERROR,
  toSafeOpsActionError,
} from './ops-action-outcome';

const INVALID_STATUS_ERROR = 'Invalid status';

type StatusTransactionOutcome = { committed: true } | { committed: false; error: string };

function transitionErrorMessage(currentStatus: ClaimStatus, newStatus: ClaimStatus): string {
  return `Illegal transition from ${currentStatus} to ${newStatus}`;
}

export async function updateStatusAction(
  claimId: string,
  newStatus: ClaimStatus,
  locale: string
): Promise<OpsActionResponse> {
  try {
    // Exercised admin-family role is checked before any claim read or tenant transaction.
    const ctx = await getOpsMutationContext();
    if (!ctx) return { success: false, error: OPS_ACTION_UNAUTHORIZED_ERROR };
    // Runtime input from the client is untrusted even though the parameter is typed.
    if (!isClaimStatus(newStatus)) return { success: false, error: INVALID_STATUS_ERROR };

    // One tenant transaction: initial read, lifecycle/payment/evidence checks, CAS transition,
    // stage history, domain events and the operational audit commit or roll back together.
    const outcome = await withTenantContext<StatusTransactionOutcome>(
      { tenantId: ctx.tenantId, role: ctx.actorRole },
      async tx => {
        const claim = await getClaimForMutation(claimId, ctx.tenantId, tx);
        const currentLifecycle = resolveClaimLifecycleReadProjection(claim);
        const currentStatus = currentLifecycle.status;
        assertCanMutateClaim(claim, ctx.actorRole, 'status_change');
        assertTransitionAllowed(currentStatus, newStatus);

        // Every admitted actor is admin family, so assigned-elsewhere claims are consistent for
        // admin, tenant_admin and super_admin; non-admin actors never reach this point.
        const transitionResult = await transitionAdminClaimStatusInTransaction(tx, {
          actor: { id: ctx.actorId, role: ctx.actorRole },
          expectedCaseLifecycleState: currentLifecycle.caseLifecycleState,
          expectedLifecycleAuthority: currentLifecycle.authority,
          expectedRecoveryLifecycleState: currentLifecycle.recoveryLifecycleState,
          expectedStatus: currentStatus,
          claimId,
          tenantId: ctx.tenantId,
          toStatus: newStatus,
        });

        if (!transitionResult.success) {
          return { committed: false, error: transitionErrorMessage(currentStatus, newStatus) };
        }

        await logAudit(
          ctx.tenantId,
          ctx.actorId,
          'update_status',
          claimId,
          { previousStatus: transitionResult.fromStatus, newStatus: transitionResult.status },
          tx
        );
        return { committed: true };
      }
    );

    if (!outcome.committed) return { success: false, error: outcome.error };
    return completeCommittedOpsAction('updateStatus', () => revalidateClaim(locale, claimId));
  } catch (error: unknown) {
    return toSafeOpsActionError('updateStatus', error);
  }
}
