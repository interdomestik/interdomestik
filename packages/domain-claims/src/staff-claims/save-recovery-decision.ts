import { claimEscalationAgreements, claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';
import type { ActionResult, RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';
import { RECOVERY_DECLINE_REASON_CODES, RECOVERY_DECISION_TYPES } from './types';
import { buildRecoveryDecisionSnapshot } from './recovery-decision';

const saveRecoveryDecisionSchema = z.discriminatedUnion('decisionType', [
  z.object({
    claimId: z.string().trim().min(1, 'Claim ID is required'),
    decisionType: z.literal(RECOVERY_DECISION_TYPES[0]),
    explanation: z.string().trim().optional(),
  }),
  z.object({
    claimId: z.string().trim().min(1, 'Claim ID is required'),
    decisionType: z.literal(RECOVERY_DECISION_TYPES[1]),
    declineReasonCode: z.enum(RECOVERY_DECLINE_REASON_CODES),
    explanation: z.string().trim().optional(),
  }),
]);

type RecoveryDecisionTransaction = {
  insert: typeof db.insert;
  select: typeof db.select;
  update: typeof db.update;
};

export async function upsertRecoveryDecisionRecord(params: {
  claimId: string;
  decisionType: SaveRecoveryDecisionInput['decisionType'];
  declineReasonCode?: Extract<
    SaveRecoveryDecisionInput,
    { decisionType: 'declined' }
  >['declineReasonCode'];
  explanation?: string;
  session: ClaimsSession;
  tenantId: string;
  tx: RecoveryDecisionTransaction;
}): Promise<RecoveryDecisionSnapshot> {
  const now = new Date();
  const explanation = params.explanation?.trim() || null;

  const [existingDecision] = await params.tx
    .select({
      id: claimEscalationAgreements.id,
      acceptedAt: claimEscalationAgreements.acceptedAt,
    })
    .from(claimEscalationAgreements)
    .where(
      withTenant(
        params.tenantId,
        claimEscalationAgreements.tenantId,
        eq(claimEscalationAgreements.claimId, params.claimId)
      )
    )
    .limit(1);

  if (existingDecision) {
    await params.tx
      .update(claimEscalationAgreements)
      .set({
        acceptedAt: now,
        acceptedById: params.session.user.id,
        decisionType: params.decisionType,
        declineReasonCode:
          params.decisionType === 'declined' ? (params.declineReasonCode ?? null) : null,
        decisionReason: explanation,
        updatedAt: now,
      })
      .where(
        withTenant(
          params.tenantId,
          claimEscalationAgreements.tenantId,
          eq(claimEscalationAgreements.claimId, params.claimId)
        )
      );
  } else {
    await params.tx.insert(claimEscalationAgreements).values({
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      claimId: params.claimId,
      decisionType: params.decisionType,
      declineReasonCode:
        params.decisionType === 'declined' ? (params.declineReasonCode ?? null) : null,
      decisionReason: explanation,
      acceptedById: params.session.user.id,
      acceptedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  return buildRecoveryDecisionSnapshot({
    decidedAt: now,
    declineReasonCode:
      params.decisionType === 'declined' ? (params.declineReasonCode ?? null) : null,
    decisionType: params.decisionType,
    explanation,
  });
}

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
    const result = await db.transaction(async tx => {
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
