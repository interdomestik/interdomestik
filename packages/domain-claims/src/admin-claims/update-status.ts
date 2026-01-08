import { claims, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';

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
  const { claimId, newStatus, session, requestHeaders } = params;

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
      id: claims.id,
      title: claims.title,
      status: claims.status,
      userId: claims.userId,
      userEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (!claimWithUser) {
    throw new Error('Claim not found');
  }

  const oldStatus = claimWithUser.status || 'draft';

  // Update status
  await db
    .update(claims)
    .set({
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)));

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'claim.status_changed',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        oldStatus,
        newStatus,
      },
      headers: requestHeaders,
    });
  }

  // Send notification to claim owner (fire-and-forget)
  if (claimWithUser.userId && claimWithUser.userEmail && oldStatus !== newStatus) {
    if (deps.notifyStatusChanged) {
      Promise.resolve(
        deps.notifyStatusChanged(
          claimWithUser.userId,
          claimWithUser.userEmail,
          { id: claimWithUser.id, title: claimWithUser.title },
          oldStatus,
          newStatus
        )
      ).catch((err: Error) => console.error('Failed to send status notification:', err));
    }
  }
}
