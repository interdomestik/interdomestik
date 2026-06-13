import { claims, db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { saveRecoveryDecisionSchema } from './recovery-decision-schema';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';
import type { ActionResult, RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';
import { upsertRecoveryDecisionRecord } from './recovery-decision-record';

export async function saveRecoveryDecisionCore(
  params: SaveRecoveryDecisionInput & {
    requestHeaders?: Headers;
    session: ClaimsSession | null;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult<RecoveryDecisionSnapshot>> {
  const { session } = params;

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveRecoveryDecisionSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid recovery decision',
    };
  }

  const scopeArgs = resolveScopedStaffClaimAccess({
    claimId: parsed.data.claimId,
    session,
  });
  const tenantId = scopeArgs.tenantId;

  try {
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    const result = await db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      const [claim] = await tx
        .select({
          id: claims.id,
        })
        .from(claims)
        .where(buildScopedStaffClaimWhere(scopeArgs))
        .limit(1);

      if (!claim) {
        return {
          success: false,
          error: STAFF_SCOPE_ACCESS_DENIED_ERROR,
        } as ActionResult<RecoveryDecisionSnapshot>;
      }

      const data = await upsertRecoveryDecisionRecord({
        claimId: parsed.data.claimId,
        decisionType: parsed.data.decisionType,
        declineReasonCode:
          parsed.data.decisionType === 'declined' ? parsed.data.declineReasonCode : undefined,
        explanation: parsed.data.explanation,
        session,
        tenantId,
        tx,
      });

      return { success: true, data } as ActionResult<RecoveryDecisionSnapshot>;
    });

    if (result.success && result.data && deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
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
    }

    const notifyRecoveryDecision = deps.notifyRecoveryDecision;

    if (result.success && result.data && notifyRecoveryDecision) {
      void (async () => {
        try {
          const claim = await db.query.claims.findFirst({
            where: (claimsTable, { eq }) =>
              withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, parsed.data.claimId)),
            columns: {
              id: true,
              title: true,
              userId: true,
            },
          });

          if (!claim?.userId) {
            return;
          }

          const member = await db.query.user.findFirst({
            where: (userTable, { eq }) =>
              withTenant(tenantId, userTable.tenantId, eq(userTable.id, claim.userId)),
            columns: {
              email: true,
            },
          });

          if (member?.email) {
            await notifyRecoveryDecision(
              claim.userId,
              member.email,
              claim,
              parsed.data.decisionType,
              {
                tenantId,
              }
            );
          }
        } catch (err) {
          console.error('Failed to send recovery decision notification:', err);
        }
      })();
    }

    return result;
  } catch (error) {
    console.error('Failed to save recovery decision:', error);
    return { success: false, error: 'Failed to save recovery decision' };
  }
}
