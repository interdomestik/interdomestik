import {
  and,
  claimEscalationAgreements,
  claims,
  db,
  eq,
  subscriptions,
  type DomainEventTx,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import {
  buildRecoverySuccessFeeCollectionSnapshot,
  normalizeRecoveryCurrencyCode,
  recordRecoverySuccessFeeCollectedEvent,
} from '@interdomestik/domain-recovery';
import {
  calculateSuccessFeeAmount,
  resolveSuccessFeeCollectionPlan,
} from '@interdomestik/domain-membership-billing/success-fees/policy';
import { z } from 'zod';

import type { ClaimsDeps, ClaimsSession } from '../claims/types';
import type {
  ActionResult,
  SaveSuccessFeeCollectionInput,
  SuccessFeeCollectionSnapshot,
} from './types';
import { buildCommercialAgreementSnapshot } from './accepted-recovery-prerequisites';
import { buildCommercialHandlingScopeFailure } from './commercial-handling-scope';
import {
  buildScopedStaffClaimWhere,
  resolveScopedStaffClaimAccess,
  STAFF_SCOPE_ACCESS_DENIED_ERROR,
} from './scope';

const saveSuccessFeeCollectionSchema = z.object({
  claimId: z.string().trim().min(1, 'Claim ID is required'),
  deductionAllowed: z.boolean(),
  recoveredAmount: z.coerce.number().positive('Recovered amount must be greater than zero'),
});

export async function saveSuccessFeeCollectionCore(
  params: SaveSuccessFeeCollectionInput & {
    requestHeaders?: Headers;
    session: ClaimsSession | null;
    now?: Date;
  },
  deps: ClaimsDeps = {}
): Promise<ActionResult<SuccessFeeCollectionSnapshot>> {
  const { session } = params;

  if (session?.user?.role !== 'staff') {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = saveSuccessFeeCollectionSchema.safeParse(params);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid success-fee collection details',
    };
  }

  const scopeArgs = resolveScopedStaffClaimAccess({
    claimId: parsed.data.claimId,
    session,
  });
  const tenantId = scopeArgs.tenantId;
  const now = params.now ?? new Date();

  try {
    const result = await db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      const [claim] = await tx
        .select({
          category: claims.category,
          currency: claims.currency,
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

      const [agreement] = await tx
        .select({
          acceptedAt: claimEscalationAgreements.acceptedAt,
          decisionNextStatus: claimEscalationAgreements.decisionNextStatus,
          decisionReason: claimEscalationAgreements.decisionReason,
          feePercentage: claimEscalationAgreements.feePercentage,
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

      const commercialAgreement = buildCommercialAgreementSnapshot({
        claimId: parsed.data.claimId,
        ...(agreement ?? {}),
      });

      if (!commercialAgreement) {
        return {
          success: false,
          error: 'Save the accepted escalation agreement before recording success-fee collection.',
        };
      }

      const [subscription] = await tx
        .select({
          id: subscriptions.id,
          providerCustomerId: subscriptions.providerCustomerId,
        })
        .from(subscriptions)
        .where(
          withTenant(tenantId, subscriptions.tenantId, and(eq(subscriptions.userId, claim.userId)))
        )
        .limit(1);

      const feeQuote = calculateSuccessFeeAmount({
        minimumFee: Number(commercialAgreement.minimumFee),
        ratePercentage: commercialAgreement.feePercentage,
        recoveryAmount: parsed.data.recoveredAmount,
      });
      const hasStoredPaymentMethod = Boolean(subscription?.providerCustomerId?.trim());
      const collectionPlan = resolveSuccessFeeCollectionPlan({
        deductionAllowed: parsed.data.deductionAllowed,
        hasStoredPaymentMethod,
        now,
        paymentAuthorizationState: commercialAgreement.paymentAuthorizationState,
      });
      const recoveredAmount = feeQuote.recoveryAmount.toFixed(2);
      const feeAmount = feeQuote.feeAmount.toFixed(2);
      const invoiceDueAt = collectionPlan.invoiceDueAt
        ? new Date(collectionPlan.invoiceDueAt)
        : null;
      const subscriptionId = hasStoredPaymentMethod ? (subscription?.id ?? null) : null;
      const currencyCode = normalizeRecoveryCurrencyCode(claim.currency);

      await tx
        .update(claimEscalationAgreements)
        .set({
          successFeeRecoveredAmount: recoveredAmount,
          successFeeCurrencyCode: currencyCode,
          successFeeAmount: feeAmount,
          successFeeCollectionMethod: collectionPlan.method,
          successFeeDeductionAllowed: parsed.data.deductionAllowed,
          successFeeHasStoredPaymentMethod: hasStoredPaymentMethod,
          successFeeInvoiceDueAt: invoiceDueAt,
          successFeeResolvedAt: now,
          successFeeResolvedById: session.user.id,
          successFeeSubscriptionId: subscriptionId,
          updatedAt: now,
        })
        .where(
          withTenant(
            tenantId,
            claimEscalationAgreements.tenantId,
            eq(claimEscalationAgreements.claimId, parsed.data.claimId)
          )
        );

      await recordRecoverySuccessFeeCollectedEvent({
        actor: { id: session.user.id, role: session.user.role },
        claimId: parsed.data.claimId,
        collectionMethod: collectionPlan.method,
        currencyCode,
        deductionAllowed: parsed.data.deductionAllowed,
        hasStoredPaymentMethod,
        invoiceDueAt,
        now,
        paymentAuthorizationState: commercialAgreement.paymentAuthorizationState,
        tenantId,
        tx: tx as DomainEventTx,
      });

      return {
        success: true,
        data: buildRecoverySuccessFeeCollectionSnapshot({
          claimId: parsed.data.claimId,
          collectionMethod: collectionPlan.method,
          currencyCode,
          deductionAllowed: parsed.data.deductionAllowed,
          feeAmount,
          hasStoredPaymentMethod,
          invoiceDueAt,
          paymentAuthorizationState: commercialAgreement.paymentAuthorizationState,
          recoveredAmount,
          resolvedAt: now,
          subscriptionId,
        }),
      };
    });

    if (result.success && result.data && deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        tenantId,
        action: 'claim.success_fee_collection_saved',
        entityType: 'claim',
        entityId: parsed.data.claimId,
        metadata: {
          collectionMethod: result.data.collectionMethod,
          currencyCode: result.data.currencyCode,
          deductionAllowed: result.data.deductionAllowed,
          feeAmount: result.data.feeAmount,
          hasStoredPaymentMethod: result.data.hasStoredPaymentMethod,
          invoiceDueAt: result.data.invoiceDueAt,
          paymentAuthorizationState: result.data.paymentAuthorizationState,
          recoveredAmount: result.data.recoveredAmount,
          resolvedAt: result.data.resolvedAt,
          subscriptionId: result.data.subscriptionId,
        },
        headers: params.requestHeaders,
      });
    }

    return result;
  } catch (error) {
    console.error('Failed to save success-fee collection:', error);
    return { success: false, error: 'Failed to save success-fee collection' };
  }
}
