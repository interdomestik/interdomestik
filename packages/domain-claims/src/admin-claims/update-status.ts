import { and, claims, db, eq, user } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import { resolveClaimLifecycleCommandProjection } from '../claims/lifecycle-read-model';
import { transitionClaimStatus, type TransitionClaimStatusResult } from '../claims/transition';

const validStatuses: readonly ClaimStatus[] = CLAIM_STATUSES;

type ClaimOwnerNotificationRow = {
  id: string;
  title: string;
  userEmail: string | null;
  userId: string | null;
};

function claimTenantWhere(tenantId: string, claimId: string) {
  return and(eq(claims.tenantId, tenantId), eq(claims.id, claimId));
}

function notifyClaimOwner(
  deps: ClaimsDeps,
  claim: ClaimOwnerNotificationRow,
  oldStatus: ClaimStatus,
  newStatus: ClaimStatus
): void {
  const notifyStatusChanged = deps.notifyStatusChanged;
  if (!claim.userId || !claim.userEmail || oldStatus === newStatus || !notifyStatusChanged) {
    return;
  }

  Promise.resolve(
    notifyStatusChanged(
      claim.userId,
      claim.userEmail,
      { id: claim.id, title: claim.title },
      oldStatus,
      newStatus
    )
  ).catch((err: Error) => console.error('Failed to send status notification:', err));
}

function throwTransitionFailure(
  result: Extract<TransitionClaimStatusResult, { success: false }>
): never {
  if (result.error === 'claim_not_found') {
    throw new Error('Claim not found');
  }
  if (result.error === 'transition_rejected') {
    throw new Error('Invalid status transition');
  }
  throw new Error('Failed to update claim status');
}

export async function updateClaimStatusCore(
  params: {
    claimId: string;
    hostId?: string | null;
    newStatus: ClaimStatus;
    session: ClaimsSession | null;
    requestHeaders: Headers;
  },
  deps: ClaimsDeps = {}
) {
  const { claimId, newStatus, session } = params;

  const role = session?.user?.role;
  const isAdminRole = role === 'admin' || role === 'tenant_admin' || role === 'super_admin';

  if (!session || !isAdminRole) {
    throw new Error('Unauthorized');
  }

  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid status');
  }

  const tenantId = ensureTenantId(session);

  const [claimWithUser] = await db
    .select({
      caseLifecycleState: claims.caseLifecycleState,
      id: claims.id,
      recoveryLifecycleState: claims.recoveryLifecycleState,
      status: claims.status,
      title: claims.title,
      userId: claims.userId,
      userEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(claimTenantWhere(tenantId, claimId));

  if (!claimWithUser) {
    throw new Error('Claim not found');
  }

  const currentState = resolveClaimLifecycleCommandProjection(claimWithUser);
  if (currentState.success && currentState.status === newStatus) {
    if (claimWithUser.status !== newStatus) {
      const repairResult = await transitionClaimStatus({
        actor: { id: session.user.id, role: session.user.role ?? null },
        claimId,
        hostId: params.hostId,
        tenantId,
        toStatus: newStatus,
      });
      if (!repairResult.success) {
        throwTransitionFailure(repairResult);
      }
    }
    return;
  }

  const result = await transitionClaimStatus({
    actor: { id: session.user.id, role: session.user.role ?? null },
    claimId,
    hostId: params.hostId,
    tenantId,
    toStatus: newStatus,
  });

  if (!result.success) {
    throwTransitionFailure(result);
  }

  await activateClaimStatusAuditProjection({ deps, tenantId });

  notifyClaimOwner(deps, claimWithUser, result.fromStatus, result.status);
}
