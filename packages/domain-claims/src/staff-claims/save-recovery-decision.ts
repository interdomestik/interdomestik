import { claims } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import {
  enqueueRecoveryDecisionNotification,
  lockClaimNotificationRecipient,
} from '@interdomestik/domain-communications/notification-deliveries';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { saveRecoveryDecisionSchema } from './recovery-decision-schema';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';
import type { ActionResult, RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';
import { upsertRecoveryDecisionRecord } from './recovery-decision-record';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function saveRecoveryDecisionCore(
  params: SaveRecoveryDecisionInput & {
    authority: TenantAuthority | null;
    requestHeaders?: Headers;
    session: ClaimsSession | null;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult<RecoveryDecisionSnapshot> & { deliveryIds?: string[] }> {
  const { authority, session } = params;

  if (!authority || session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveRecoveryDecisionSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid recovery decision',
    };
  }

  const { tenantId } = readTenantAuthority(authority);
  const scopeArgs = {
    ...resolveScopedStaffClaimAccess({
      claimId: parsed.data.claimId,
      session,
    }),
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
        actor: { id: session.user.id, role: 'staff' },
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
          actorId: session.user.id,
          actorRole: session.user.role,
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
          headers: params.requestHeaders,
        });
      } catch (error) {
        console.error('Recovery decision audit projection failed', error);
      }
    }

    return result;
  } catch (error) {
    console.error('Failed to save recovery decision:', error);
    return { success: false, error: 'Failed to save recovery decision' };
  }
}
