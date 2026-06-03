import { db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import { transitionClaimStatus } from './transition';
import type { ClaimsDeps, ClaimsSession } from './types';

function transitionFailureMessage(error: string): string {
  if (error === 'claim_not_found') {
    return 'Claim not found';
  }

  if (error === 'invalid_current_status') {
    return 'Invalid current claim status';
  }

  return 'Invalid status transition';
}

async function loadTenantClaim(tenantId: string, claimId: string) {
  return db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
  });
}

function cancellationAccessError(
  claim: Awaited<ReturnType<typeof loadTenantClaim>>,
  userId: string
): string | null {
  if (!claim) {
    return 'Claim not found';
  }

  if (claim.userId !== userId) {
    return 'Access denied';
  }

  if (claim.status === 'resolved' || claim.status === 'rejected') {
    return 'Claim cannot be cancelled';
  }

  return null;
}

export async function cancelClaimCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, claimId } = params;

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const accessError = cancellationAccessError(
    await loadTenantClaim(tenantId, claimId),
    session.user.id
  );
  if (accessError) {
    return { success: false, error: accessError };
  }

  try {
    const transitionResult = await transitionClaimStatus({
      actor: { id: session.user.id, role: session.user.role ?? null },
      claimId,
      tenantId,
      toStatus: 'rejected',
    });

    if (!transitionResult.success) {
      return { success: false, error: transitionFailureMessage(transitionResult.error) };
    }

    await deps.logAuditEvent?.({
      actorId: session.user.id,
      actorRole: session.user.role,
      tenantId,
      action: 'claim.cancelled',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        oldStatus: transitionResult.fromStatus,
        newStatus: transitionResult.status,
      },
      headers: requestHeaders,
    });
  } catch (error) {
    console.error('Failed to cancel claim:', error);
    return { success: false, error: 'Failed to cancel claim' };
  }

  await deps.revalidatePath?.('/member/claims');
  await deps.revalidatePath?.(`/member/claims/${claimId}`);

  return { success: true };
}
