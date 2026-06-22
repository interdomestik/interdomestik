import { claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
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
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (!claimWithUser) {
    throw new Error('Claim not found');
  }

  const currentState = resolveClaimLifecycleCommandProjection(claimWithUser);
  if (currentState.success && currentState.status === newStatus) {
    if (claimWithUser.status !== newStatus) {
      await db
        .update(claims)
        .set({ status: newStatus })
        .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));
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

  // Send notification to claim owner (fire-and-forget)
  if (
    claimWithUser.userId &&
    claimWithUser.userEmail &&
    persistedOldStatus !== persistedNewStatus
  ) {
    if (deps.notifyStatusChanged) {
      Promise.resolve(
        deps.notifyStatusChanged(
          claimWithUser.userId,
          claimWithUser.userEmail,
          { id: claimWithUser.id, title: claimWithUser.title },
          persistedOldStatus,
          persistedNewStatus
        )
      ).catch((err: Error) => console.error('Failed to send status notification:', err));
    }
  }
}
