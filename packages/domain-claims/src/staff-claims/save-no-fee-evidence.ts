import { claimRecoveryNoFeeEvidence, claims, db } from '@interdomestik/database';
import { z } from 'zod';
import type { ActionResult, ClaimsDeps, ClaimsSession } from '../claims/types';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';

const noFeeEvidenceReasonCodes = ['no_recovery', 'not_billable_under_recovery_scope'] as const;

const saveNoFeeEvidenceSchema = z.object({
  claimId: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
  reasonCode: z.enum(noFeeEvidenceReasonCodes),
});

export type SaveNoFeeEvidenceInput = z.input<typeof saveNoFeeEvidenceSchema>;
export type NoFeeEvidenceSnapshot = {
  claimId: string;
  documentedAt: Date;
  documentedById: string;
  reason: string | null;
  reasonCode: (typeof noFeeEvidenceReasonCodes)[number];
};

export async function saveNoFeeEvidenceCore(
  params: SaveNoFeeEvidenceInput & {
    requestHeaders?: Headers;
    session: ClaimsSession | null;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult<NoFeeEvidenceSnapshot>> {
  const { session } = params;

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  const parsed = saveNoFeeEvidenceSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid no-fee evidence',
      data: undefined,
    };
  }

  const scopeArgs = resolveScopedStaffClaimAccess({ claimId: parsed.data.claimId, session });
  const now = new Date();
  const reason = parsed.data.reason?.trim() || null;

  try {
    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values and where clause.
    const result = await db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: buildScopedStaffClaimWhere includes tenant, claim, branch, and staff scope.
      const [claim] = await tx
        .select({ id: claims.id })
        .from(claims)
        .where(buildScopedStaffClaimWhere(scopeArgs))
        .limit(1);

      if (!claim) {
        return { success: false, error: STAFF_SCOPE_ACCESS_DENIED_ERROR, data: undefined };
      }

      // db-access-guard: tenant-scoped -- reason: tenantId and claimId are written into the no-fee evidence key.
      const [evidence] = await tx
        .insert(claimRecoveryNoFeeEvidence)
        .values({
          id: crypto.randomUUID(),
          tenantId: scopeArgs.tenantId,
          claimId: parsed.data.claimId,
          reasonCode: parsed.data.reasonCode,
          reason,
          documentedById: session.user.id,
          documentedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [claimRecoveryNoFeeEvidence.tenantId, claimRecoveryNoFeeEvidence.claimId],
          set: {
            reasonCode: parsed.data.reasonCode,
            reason,
            documentedById: session.user.id,
            documentedAt: now,
            updatedAt: now,
          },
        })
        .returning({
          claimId: claimRecoveryNoFeeEvidence.claimId,
          documentedAt: claimRecoveryNoFeeEvidence.documentedAt,
          documentedById: claimRecoveryNoFeeEvidence.documentedById,
          reason: claimRecoveryNoFeeEvidence.reason,
          reasonCode: claimRecoveryNoFeeEvidence.reasonCode,
        });

      return { success: true, data: evidence };
    });

    if (result.success && result.data && deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId: scopeArgs.tenantId,
        action: 'claim.no_fee_evidence_saved',
        entityType: 'claim',
        entityId: parsed.data.claimId,
        metadata: { reasonCode: result.data.reasonCode },
        headers: params.requestHeaders,
      });
    }

    return result as ActionResult<NoFeeEvidenceSnapshot>;
  } catch (error) {
    console.error('Failed to save no-fee evidence:', error);
    return { success: false, error: 'Failed to save no-fee evidence', data: undefined };
  }
}
