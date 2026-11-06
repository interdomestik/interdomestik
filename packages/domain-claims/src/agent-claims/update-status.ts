import { claims, eq, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, ClaimsDeps, ClaimsSession } from '../claims/types';
import { activateClaimStatusAuditProjection } from '../claims/audit-projection';
import { transitionClaimStatus } from '../claims/transition';
import { claimStatusSchema } from '../validators/claims';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

function isStaff(role: string | null | undefined) {
  return role === 'staff';
}

function isStaffOrAdmin(role: string | null | undefined) {
  return role === 'staff' || role === 'admin';
}

function transitionFailureMessage(error: string): string {
  if (error === 'claim_not_found') {
    return 'Claim not found';
  }

  if (error === 'invalid_current_status') {
    return 'Invalid current claim status';
  }

  return 'Invalid status transition';
}

export async function updateClaimStatusCore(
  params: {
    authority: TenantAuthority | null;
    claimId: string;
    hostId?: string | null;
    newStatus: string;
    session: ClaimsSession | null;
    requestHeaders: Headers;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { authority, claimId, newStatus, session } = params;

  if (!session || !authority || !isStaffOrAdmin(session.user.role)) {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  // Validate status
  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status', data: undefined };
  }
  const status = parsed.data.status;

  ensureTenantId(session);
  const { tenantId } = readTenantAuthority(authority);

  // Fetch claim with user info before update
  const [claimWithUser] = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: claims.id,
        title: claims.title,
        staffId: claims.staffId,
        caseLifecycleState: claims.caseLifecycleState,
        userId: claims.userId,
        userEmail: user.email,
      })
      .from(claims)
      .leftJoin(user, eq(claims.userId, user.id))
      .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)))
  );

  if (!claimWithUser) {
    return { success: false, error: 'Claim not found', data: undefined };
  }

  // Staff act only on their own submitted claims: a member's draft (or a missing lifecycle) is denied.
  const lifecycle = claimWithUser.caseLifecycleState;
  if (
    isStaff(session.user.role) &&
    (claimWithUser.staffId !== session.user.id || lifecycle == null || lifecycle === 'draft')
  ) {
    return { success: false, error: 'Access denied', data: undefined };
  }

  const transitionResult = await transitionClaimStatus({
    actor: { id: session.user.id, role: session.user.role ?? null },
    claimId,
    hostId: params.hostId,
    authority,
    toStatus: status,
  });

  if (!transitionResult.success) {
    return {
      success: false,
      error: transitionFailureMessage(transitionResult.error),
      data: undefined,
    };
  }

  const oldStatus = transitionResult.fromStatus;
  const persistedStatus = transitionResult.status;

  await activateClaimStatusAuditProjection({ authority, deps });

  // Send notification to claim owner (fire-and-forget)
  if (
    claimWithUser.userId &&
    claimWithUser.userEmail &&
    oldStatus !== persistedStatus &&
    deps.notifyStatusChanged
  ) {
    Promise.resolve(
      deps.notifyStatusChanged(
        claimWithUser.userId,
        claimWithUser.userEmail,
        { id: claimWithUser.id, title: claimWithUser.title },
        oldStatus,
        persistedStatus,
        { authority }
      )
    ).catch((err: Error) => console.error('Failed to send status notification:', err));
  }

  return { success: true, error: undefined };
}
