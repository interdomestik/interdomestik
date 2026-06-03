import type { ClaimStatus } from '@interdomestik/database/constants';
import { transitionAdminClaimStatus } from '@interdomestik/domain-claims/admin-claims/status-transition';

import {
  assertCanMutateClaim,
  assertTransitionAllowed,
  getActionSession,
  getClaimForMutation,
  logAudit,
  type OpsActionResponse,
  revalidateClaim,
} from './action-helpers';

function transitionErrorMessage(currentStatus: ClaimStatus, newStatus: ClaimStatus): string {
  return `Illegal transition from ${currentStatus} to ${newStatus}`;
}

export async function updateStatusAction(
  claimId: string,
  newStatus: ClaimStatus,
  locale: string
): Promise<OpsActionResponse> {
  try {
    const ctx = await getActionSession();
    if (!ctx) return { success: false, error: 'Unauthorized' };

    const claim = await getClaimForMutation(claimId, ctx.tenantId);
    const currentStatus = claim.status as ClaimStatus;
    assertCanMutateClaim(claim, ctx.session.user.role, 'status_change');
    assertTransitionAllowed(currentStatus, newStatus);

    if (
      claim.staffId &&
      claim.staffId !== ctx.session.user.id &&
      ctx.session.user.role !== 'admin'
    ) {
      throw new Error('Only the assigned owner can update the status.');
    }

    const transitionResult = await transitionAdminClaimStatus({
      actor: { id: ctx.session.user.id, role: ctx.session.user.role ?? null },
      claimId,
      fromStatus: currentStatus,
      tenantId: ctx.tenantId,
      toStatus: newStatus,
    });

    if (!transitionResult.success) {
      return {
        success: false,
        error: transitionErrorMessage(currentStatus, newStatus),
      };
    }

    await logAudit(ctx.tenantId, ctx.session.user.id, 'update_status', claimId, {
      previousStatus: transitionResult.fromStatus,
      newStatus: transitionResult.status,
    });
    revalidateClaim(locale, claimId);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: (error as Error).message };
  }
}
