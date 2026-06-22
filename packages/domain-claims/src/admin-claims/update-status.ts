import { and, claims, db, eq, user } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import { resolveClaimLifecycleCommandProjection } from '../claims/lifecycle-read-model';
import { transitionClaimStatus } from '../claims/transition';

type ClaimStatus =
  | 'draft'
  | 'submitted'
  | 'verification'
  | 'evaluation'
  | 'negotiation'
  | 'court'
  | 'resolved'
  | 'rejected';

const validStatuses: ClaimStatus[] = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
];

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

export async function updateClaimStatusCore(
  params: {
    claimId: string;
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

  // Fetch claim with user info before update
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
      await transitionClaimStatus({
        actor: { id: session.user.id, role: session.user.role ?? null },
        claimId,
        tenantId,
        toStatus: newStatus,
      });
    }
    return;
  }

  const result = await transitionClaimStatus({
    actor: { id: session.user.id, role: session.user.role ?? null },
    claimId,
    tenantId,
    toStatus: newStatus,
  });

  if (!result.success) {
    if (result.error === 'claim_not_found') {
      throw new Error('Claim not found');
    }
    if (result.error === 'transition_rejected') {
      throw new Error('Invalid status transition');
    }
    throw new Error('Failed to update claim status');
  }

  const persistedOldStatus = result.fromStatus;
  const persistedNewStatus = result.status;

  await activateClaimStatusAuditProjection({ deps, tenantId });

  notifyClaimOwner(deps, claimWithUser, persistedOldStatus, persistedNewStatus);
}
