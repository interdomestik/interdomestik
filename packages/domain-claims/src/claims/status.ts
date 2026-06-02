import { db } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, ClaimsDeps, ClaimsSession } from './types';
import type { TransitionClaimStatusResult } from './transition';

import { getPaymentAuthorizationState } from '../admin-claims/payment-authorization';
import { claimStatusSchema } from '../validators/claims';
import { transitionClaimStatus } from './transition';

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
  claimId: string;
  status: ClaimStatus;
  tenantId: string;
}): Promise<TransitionClaimStatusResult> {
  const { actorId, actorRole, claimId, status, tenantId } = args;
  const paymentAuthorizationState = await getPaymentAuthorizationState({
    claimId,
    status,
    tenantId,
  });

  return transitionClaimStatus({
    actor: { id: actorId, role: actorRole ?? null },
    claimId,
    ...(paymentAuthorizationState === undefined ? {} : { paymentAuthorizationState }),
    tenantId,
    toStatus: status,
  });
}

export async function updateClaimStatusCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    claimId: string;
    newStatus: string;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult> {
  const { session, requestHeaders, claimId, newStatus } = params;

  if (!session || !isStaffOrAdmin(session.user.role ?? null)) {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  const parsed = claimStatusSchema.safeParse({ status: newStatus });
  if (!parsed.success) {
    return { success: false, error: 'Invalid status', data: undefined };
  }

  // validated by safeParse above
  const { status } = parsed.data;

  const tenantId = ensureTenantId(session);

  try {
    const claim = await db.query.claims.findFirst({
      where: (claimsTable, { eq }) =>
        withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
    });

    if (!claim) {
      return { success: false, error: 'Claim not found', data: undefined };
    }

    const transitionResult = await runStatusTransition({
      actorId: session.user.id,
      actorRole: session.user.role,
      claimId,
      status,
      tenantId,
    });

    if (!transitionResult.success) {
      return transitionFailureResult(transitionResult);
    }

    const oldStatus = transitionResult.fromStatus;
    const persistedStatus = transitionResult.status;

    await deps.logAuditEvent?.({
      action: 'claim.status_changed',
      actorId: session.user.id,
      actorRole: session.user.role,
      entityId: claimId,
      entityType: 'claim',
      headers: requestHeaders,
      metadata: { oldStatus, newStatus: persistedStatus },
      tenantId,
    });

    if (claim.userId && oldStatus !== persistedStatus && deps.notifyStatusChanged) {
      const member = await db.query.user.findFirst({
        where: (userTable, { eq }) =>
          withTenant(tenantId, userTable.tenantId, eq(userTable.id, claim.userId)),
      });

      if (member?.email) {
        Promise.resolve(
          deps.notifyStatusChanged(
            claim.userId,
            member.email,
            { id: claimId, title: claim.title },
            oldStatus,
            persistedStatus
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
