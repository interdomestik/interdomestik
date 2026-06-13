import {
  claimEscalationAgreements,
  claims,
  db,
  eq,
  type DomainEventTx,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { z } from 'zod';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import { buildCommercialHandlingScopeFailure } from './commercial-handling-scope';
import {
  buildEscalationAgreementSnapshot,
  recordEscalationAgreementEvent,
} from './escalation-agreement-record';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';
import type { ActionResult, SaveClaimEscalationAgreementInput } from './types';
import { ESCALATION_DECISION_NEXT_STATUSES, PAYMENT_AUTHORIZATION_STATES } from './types';

const saveClaimEscalationAgreementSchema = z
  .object({
    claimId: z.string().trim().min(1, 'Claim ID is required'),
    decisionNextStatus: z.enum(ESCALATION_DECISION_NEXT_STATUSES),
    decisionReason: z.string().trim().min(1, 'Decision reason is required'),
    feePercentage: z.coerce.number().int().min(1, 'Fee percentage must be at least 1'),
    minimumFee: z.coerce.number().positive('Minimum fee must be greater than zero'),
    legalActionCapPercentage: z.coerce.number().int().min(1, 'Legal-action cap must be at least 1'),
    paymentAuthorizationState: z.enum(PAYMENT_AUTHORIZATION_STATES),
    termsVersion: z.string().trim().min(1, 'Terms version is required'),
  })
  .refine(
    value => value.legalActionCapPercentage >= value.feePercentage,
    'Legal-action cap must be greater than or equal to the agreed fee percentage'
  );

export async function saveClaimEscalationAgreementCore(
  params: SaveClaimEscalationAgreementInput & {
    requestHeaders?: Headers;
    session: ClaimsSession | null;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult<ReturnType<typeof buildEscalationAgreementSnapshot>>> {
  const { session } = params;

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveClaimEscalationAgreementSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid escalation agreement',
    };
  }

  const scopeArgs = resolveScopedStaffClaimAccess({
    claimId: parsed.data.claimId,
    session,
  });
  const tenantId = scopeArgs.tenantId;
  const now = new Date();
  const decisionReason = parsed.data.decisionReason.trim();
  const minimumFee = parsed.data.minimumFee.toFixed(2);

  try {
    const result = await db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      const [claim] = await tx
        .select({
          category: claims.category,
          id: claims.id,
          userId: claims.userId,
        })
        .from(claims)
        .where(buildScopedStaffClaimWhere(scopeArgs))
        .limit(1);

      if (!claim) {
        return { success: false, error: STAFF_SCOPE_ACCESS_DENIED_ERROR };
      }

      const commercialScopeFailure = buildCommercialHandlingScopeFailure({
        claimCategory: claim.category,
        fallbackError:
          'This matter cannot move into success-fee handling under the current launch scope.',
      });

      if (commercialScopeFailure) {
        return commercialScopeFailure;
      }

      const [existingAgreement] = await tx
        .select({
          acceptedAt: claimEscalationAgreements.acceptedAt,
          claimId: claimEscalationAgreements.claimId,
          decisionNextStatus: claimEscalationAgreements.decisionNextStatus,
          decisionReason: claimEscalationAgreements.decisionReason,
          feePercentage: claimEscalationAgreements.feePercentage,
          id: claimEscalationAgreements.id,
          legalActionCapPercentage: claimEscalationAgreements.legalActionCapPercentage,
          minimumFee: claimEscalationAgreements.minimumFee,
          paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
          signedAt: claimEscalationAgreements.signedAt,
          termsVersion: claimEscalationAgreements.termsVersion,
        })
        .from(claimEscalationAgreements)
        .where(
          withTenant(
            tenantId,
            claimEscalationAgreements.tenantId,
            eq(claimEscalationAgreements.claimId, parsed.data.claimId)
          )
        )
        .limit(1);

      if (existingAgreement) {
        const signedAt = existingAgreement.signedAt ?? now;

        await tx
          .update(claimEscalationAgreements)
          .set({
            acceptedAt: now,
            acceptedById: session.user.id,
            decisionNextStatus: parsed.data.decisionNextStatus,
            decisionReason,
            feePercentage: parsed.data.feePercentage,
            legalActionCapPercentage: parsed.data.legalActionCapPercentage,
            minimumFee,
            paymentAuthorizationState: parsed.data.paymentAuthorizationState,
            signedAt,
            signedByUserId: claim.userId,
            termsVersion: parsed.data.termsVersion,
            updatedAt: now,
          })
          .where(
            withTenant(
              tenantId,
              claimEscalationAgreements.tenantId,
              eq(claimEscalationAgreements.claimId, parsed.data.claimId)
            )
          );

        const data = buildEscalationAgreementSnapshot({
          acceptedAt: now,
          claimId: parsed.data.claimId,
          decisionNextStatus: parsed.data.decisionNextStatus,
          decisionReason,
          feePercentage: parsed.data.feePercentage,
          legalActionCapPercentage: parsed.data.legalActionCapPercentage,
          minimumFee,
          paymentAuthorizationState: parsed.data.paymentAuthorizationState,
          signedAt,
          termsVersion: parsed.data.termsVersion,
        });

        await recordEscalationAgreementEvent({
          claimId: parsed.data.claimId,
          decisionNextStatus: parsed.data.decisionNextStatus,
          decisionReason,
          feePercentage: parsed.data.feePercentage,
          legalActionCapPercentage: parsed.data.legalActionCapPercentage,
          minimumFee,
          now,
          paymentAuthorizationState: parsed.data.paymentAuthorizationState,
          session,
          tenantId,
          tx: tx as DomainEventTx,
        });

        return { success: true, data };
      }

      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      await tx.insert(claimEscalationAgreements).values({
        id: crypto.randomUUID(),
        tenantId,
        claimId: parsed.data.claimId,
        decisionNextStatus: parsed.data.decisionNextStatus,
        decisionReason,
        signedByUserId: claim.userId,
        acceptedById: session.user.id,
        feePercentage: parsed.data.feePercentage,
        minimumFee,
        legalActionCapPercentage: parsed.data.legalActionCapPercentage,
        paymentAuthorizationState: parsed.data.paymentAuthorizationState,
        termsVersion: parsed.data.termsVersion,
        signedAt: now,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const data = buildEscalationAgreementSnapshot({
        acceptedAt: now,
        claimId: parsed.data.claimId,
        decisionNextStatus: parsed.data.decisionNextStatus,
        decisionReason,
        feePercentage: parsed.data.feePercentage,
        legalActionCapPercentage: parsed.data.legalActionCapPercentage,
        minimumFee,
        paymentAuthorizationState: parsed.data.paymentAuthorizationState,
        signedAt: now,
        termsVersion: parsed.data.termsVersion,
      });

      await recordEscalationAgreementEvent({
        claimId: parsed.data.claimId,
        decisionNextStatus: parsed.data.decisionNextStatus,
        decisionReason,
        feePercentage: parsed.data.feePercentage,
        legalActionCapPercentage: parsed.data.legalActionCapPercentage,
        minimumFee,
        now,
        paymentAuthorizationState: parsed.data.paymentAuthorizationState,
        session,
        tenantId,
        tx: tx as DomainEventTx,
      });

      return { success: true, data };
    });

    if (result.success && result.data && deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.commercial_terms_saved',
        entityType: 'claim',
        entityId: parsed.data.claimId,
        metadata: {
          acceptedAt: result.data.acceptedAt,
          decisionNextStatus: result.data.decisionNextStatus,
          decisionReason: result.data.decisionReason,
          decisionType: 'accepted',
          feePercentage: result.data.feePercentage,
          legalActionCapPercentage: result.data.legalActionCapPercentage,
          minimumFee: result.data.minimumFee,
          paymentAuthorizationState: result.data.paymentAuthorizationState,
          signedAt: result.data.signedAt,
          termsVersion: result.data.termsVersion,
        },
        headers: params.requestHeaders,
      });
    }

    return result;
  } catch (error) {
    console.error('Failed to save claim escalation agreement:', error);
    return { success: false, error: 'Failed to save claim escalation agreement' };
  }
}
