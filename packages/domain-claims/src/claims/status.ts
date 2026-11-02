import type { ClaimStatus } from '@interdomestik/database/constants';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, ClaimsDeps, ClaimsSession } from './types';
import type { TransitionClaimStatusResult } from './transition';

import { claimStatusSchema } from '../validators/claims';
import { activateClaimStatusAuditProjection } from './audit-projection';
import { transitionClaimStatus } from './transition';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

function isStaffOrAdmin(role: string | null | undefined): boolean {
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

type FailedTransition = Extract<TransitionClaimStatusResult, { success: false }>;

function transitionFailureResult(result: FailedTransition): ActionResult {
  return { success: false, error: transitionFailureMessage(result.error), data: undefined };
}

async function runStatusTransition(args: {
  actorId: string;
  actorRole: string | null | undefined;
  authority: TenantAuthority;
  claimId: string;
  hostId?: string | null;
  status: ClaimStatus;
}): Promise<TransitionClaimStatusResult> {
  const { actorId, actorRole, authority, claimId, hostId, status } = args;

  return transitionClaimStatus({
    actor: { id: actorId, role: actorRole ?? null },
    authority,
    claimId,
    hostId,
    toStatus: status,
  });
}

export async function updateClaimStatusCore(
  params: {
    authority: TenantAuthority | null;
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
    hostId?: string | null;
    newStatus: string;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { authority, session, claimId, newStatus } = params;

  if (!session || !authority || !isStaffOrAdmin(session.user.role ?? null)) {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status', data: undefined };
  }

  // validated by safeParse above
  const { status } = parsed.data;

  ensureTenantId(session);
  const { tenantId } = readTenantAuthority(authority);

  try {
    const claim = await withTenantAuthority(authority, tx =>
      tx.query.claims.findFirst({
        where: (claimsTable, { eq }) =>
          withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
      })
    );

    if (!claim) {
      return { success: false, error: 'Claim not found', data: undefined };
    }

    const transitionResult = await runStatusTransition({
      actorId: session.user.id,
      actorRole: session.user.role,
      authority,
      claimId,
      hostId: params.hostId,
      status,
    });

    if (!transitionResult.success) {
      return transitionFailureResult(transitionResult);
    }

    const oldStatus = transitionResult.fromStatus;
    const persistedStatus = transitionResult.status;

    await activateClaimStatusAuditProjection({ authority, deps });

    if (claim.userId && oldStatus !== persistedStatus && deps.notifyStatusChanged) {
      const claimOwnerId = claim.userId;
      const member = await withTenantAuthority(authority, tx =>
        tx.query.user.findFirst({
          where: (userTable, { eq }) =>
            withTenant(tenantId, userTable.tenantId, eq(userTable.id, claimOwnerId)),
        })
      );

      if (member?.email) {
        Promise.resolve(
          deps.notifyStatusChanged(
            claim.userId,
            member.email,
            { id: claimId, title: claim.title },
            oldStatus,
            persistedStatus,
            { authority }
          )
        ).catch((err: Error) => console.error('Failed to send status change notification:', err));
      }
    }

    if (deps.revalidatePath) {
      await deps.revalidatePath('/admin/claims');
      await deps.revalidatePath(`/admin/claims/${claimId}`);
      await deps.revalidatePath('/member/claims');
    }

    return { success: true, error: undefined };
  } catch (e) {
    console.error('Failed to update status:', e);
    return { success: false, error: 'Failed to update status', data: undefined };
  }
}
