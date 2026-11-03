import { and, claims, eq, user } from '@interdomestik/database';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import { resolveClaimLifecycleCommandProjection } from '../claims/lifecycle-read-model';
import { transitionClaimStatus, type TransitionClaimStatusResult } from '../claims/transition';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  authority: TenantAuthority,
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
      newStatus,
      { authority }
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
    authority: TenantAuthority | null;
    claimId: string;
    hostId?: string | null;
    newStatus: ClaimStatus;
    session: ClaimsSession | null;
    requestHeaders: Headers;
  },
  deps: ClaimsDeps = {}
) {
  const { authority, claimId, newStatus, session } = params;

  const role = session?.user?.role;
  const isAdminRole = role === 'admin' || role === 'tenant_admin' || role === 'super_admin';

  if (!session || !authority || !isAdminRole) {
    throw new Error('Unauthorized');
  }

  if (!validStatuses.includes(newStatus)) {
    throw new Error('Invalid status');
  }

  ensureTenantId(session);
  const { tenantId } = readTenantAuthority(authority);

  const [claimWithUser] = await withTenantAuthority(authority, tx =>
    tx
      .select({
        caseLifecycleState: claims.caseLifecycleState,
        id: claims.id,
        recoveryLifecycleState: claims.recoveryLifecycleState,
        title: claims.title,
        userId: claims.userId,
        userEmail: user.email,
      })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id))
      .where(claimTenantWhere(tenantId, claimId))
  );

  if (!claimWithUser) {
    throw new Error('Claim not found');
  }

  const currentState = resolveClaimLifecycleCommandProjection(claimWithUser);
  if (currentState.success && currentState.status === newStatus) {
    return;
  }

  const result = await transitionClaimStatus({
    actor: { id: session.user.id, role: session.user.role ?? null },
    claimId,
    hostId: params.hostId,
    authority,
    toStatus: newStatus,
  });

  if (!result.success) {
    throwTransitionFailure(result);
  }

  await activateClaimStatusAuditProjection({ authority, deps });

  notifyClaimOwner(deps, authority, claimWithUser, result.fromStatus, result.status);
}
