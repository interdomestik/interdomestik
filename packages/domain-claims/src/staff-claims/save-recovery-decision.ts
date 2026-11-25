import { claims } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import {
  enqueueRecoveryDecisionNotification,
  lockClaimNotificationRecipient,
} from '@interdomestik/domain-communications/notification-deliveries';
import { reportServerError } from '@interdomestik/domain-communications/server-error';

import { resolveBoundClaimPrincipal } from '../claims/status-actor';
import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { saveRecoveryDecisionSchema } from './recovery-decision-schema';
import { buildScopedStaffClaimWhere, STAFF_SCOPE_ACCESS_DENIED_ERROR } from './scope';
import type { ActionResult, RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';
import { upsertRecoveryDecisionRecord } from './recovery-decision-record';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export function resolveRecoveryDecisionActor(
  authority: TenantAuthority | null,
  session: ClaimsSession | null
) {
  const actor = resolveBoundClaimPrincipal(authority, session);
  if (actor?.principal.role !== 'staff') return null;
  return {
    id: actor.principal.userId,
    branchId: actor.principal.branchId,
    tenantId: actor.tenantId,
  };
}

export async function saveRecoveryDecisionCore(
  params: SaveRecoveryDecisionInput & {
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: ClaimsSession | null;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult<RecoveryDecisionSnapshot> & { deliveryIds?: string[] }> {
  const { authority, session, requestHeaders, ...input } = params;
  const actor = resolveRecoveryDecisionActor(authority, session);

  if (!authority || !actor) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveRecoveryDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid recovery decision',
    };
  }

  const { id: userId, branchId, tenantId } = actor;
  const scopeArgs = {
    claimId: parsed.data.claimId,
    userId,
    branchId,
    tenantId,
  };

  try {
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const result = await withTenantAuthority(authority, async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      const [claim] = await tx
        .select({
          id: claims.id,
          title: claims.title,
          userId: claims.userId,
        })
        .from(claims)
        .where(buildScopedStaffClaimWhere(scopeArgs))
        .limit(1)
        .for('no key update');

      if (!claim) {
        return {
          success: false,
          error: STAFF_SCOPE_ACCESS_DENIED_ERROR,
        } as ActionResult<RecoveryDecisionSnapshot>;
      }

      const recipient = await lockClaimNotificationRecipient(tx, tenantId, claim.userId);
      const { snapshot, decisionDomainEventId } = await upsertRecoveryDecisionRecord({
        claimId: parsed.data.claimId,
        decisionType: parsed.data.decisionType,
        declineReasonCode:
          parsed.data.decisionType === 'declined' ? parsed.data.declineReasonCode : undefined,
        explanation: parsed.data.explanation,
        actor: { id: userId, role: 'staff' },
        tenantId,
        tx,
      });

      const deliveryIds = recipient
        ? await enqueueRecoveryDecisionNotification(tx, {
            tenantId,
            claimId: claim.id,
            recipient,
            title: claim.title,
            decision: parsed.data.decisionType,
            decisionDomainEventId,
          })
        : [];
      return { success: true as const, data: snapshot, deliveryIds };
    });

    if (result.success && result.data && deps.logAuditEvent) {
      try {
        await deps.logAuditEvent({
          actorId: userId,
          actorRole: 'staff',
          authority,
          action: 'claim.recovery_decision_saved',
          entityType: 'claim',
          entityId: parsed.data.claimId,
          metadata: {
            decisionType: result.data.status,
            declineReasonCode: result.data.declineReasonCode ?? undefined,
            decisionReason: result.data.explanation ?? undefined,
            memberDecisionLabel: result.data.memberLabel ?? undefined,
          },
          headers: requestHeaders,
        });
      } catch (error) {
        reportServerError('Recovery decision audit projection failed', error);
      }
    }

    return result;
  } catch (error) {
    reportServerError('Failed to save recovery decision', error);
    return { success: false, error: 'Failed to save recovery decision' };
  }
}
