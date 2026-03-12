import {
  and,
  claimEscalationAgreements,
  claims,
  db,
  eq,
  subscriptions,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import {
  calculateSuccessFeeAmount,
  resolveSuccessFeeCollectionPlan,
} from '@interdomestik/domain-membership-billing/success-fees/policy';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { z } from 'zod';

import type { ClaimsSession } from '../claims/types';
import type {
  ActionResult,
  PaymentAuthorizationState,
  SaveSuccessFeeCollectionInput,
  SuccessFeeCollectionSnapshot,
} from './types';

const saveSuccessFeeCollectionSchema = z.object({
  claimId: z.string().trim().min(1, 'Claim ID is required'),
  deductionAllowed: z.boolean(),
  recoveredAmount: z.coerce.number().positive('Recovered amount must be greater than zero'),
});

type DateLike = Date | string | null | undefined;

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : 'EUR';
}

function normalizeDate(value: DateLike) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildSnapshot(params: {
  claimId: string;
  collectionMethod: SuccessFeeCollectionSnapshot['collectionMethod'];
  currencyCode: string;
  deductionAllowed: boolean;
  feeAmount: string;
  hasStoredPaymentMethod: boolean;
  invoiceDueAt: DateLike;
  paymentAuthorizationState: PaymentAuthorizationState;
  recoveredAmount: string;
  resolvedAt: DateLike;
  subscriptionId: string | null;
}): SuccessFeeCollectionSnapshot {
  return {
    claimId: params.claimId,
    collectionMethod: params.collectionMethod,
    currencyCode: params.currencyCode,
    deductionAllowed: params.deductionAllowed,
    feeAmount: params.feeAmount,
    hasStoredPaymentMethod: params.hasStoredPaymentMethod,
    invoiceDueAt: normalizeDate(params.invoiceDueAt),
    paymentAuthorizationState: params.paymentAuthorizationState,
    recoveredAmount: params.recoveredAmount,
    resolvedAt: normalizeDate(params.resolvedAt),
    subscriptionId: params.subscriptionId,
  };
}

export async function saveSuccessFeeCollectionCore(
  params: SaveSuccessFeeCollectionInput & {
    session: ClaimsSession | null;
    now?: Date;
  }
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

  const tenantId = ensureTenantId(session);
  const now = params.now ?? new Date();

  try {
    return await db.transaction(async tx => {
      const [claim] = await tx
        .select({
          currency: claims.currency,
          id: claims.id,
          userId: claims.userId,
        })
        .from(claims)
        .where(withTenant(tenantId, claims.tenantId, and(eq(claims.id, parsed.data.claimId))))
        .limit(1);

      if (!claim) {
        return { success: false, error: 'Claim not found' };
      }

      const [agreement] = await tx
        .select({
          feePercentage: claimEscalationAgreements.feePercentage,
          minimumFee: claimEscalationAgreements.minimumFee,
          paymentAuthorizationState: claimEscalationAgreements.paymentAuthorizationState,
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

      if (!agreement?.paymentAuthorizationState || !agreement.minimumFee) {
        return { success: false, error: 'Escalation agreement not found' };
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
        minimumFee: Number(agreement.minimumFee),
        ratePercentage: agreement.feePercentage,
        recoveryAmount: parsed.data.recoveredAmount,
      });
      const hasStoredPaymentMethod = Boolean(subscription?.providerCustomerId?.trim());
      const collectionPlan = resolveSuccessFeeCollectionPlan({
        deductionAllowed: parsed.data.deductionAllowed,
        hasStoredPaymentMethod,
        now,
        paymentAuthorizationState: agreement.paymentAuthorizationState as PaymentAuthorizationState,
      });
      const recoveredAmount = feeQuote.recoveryAmount.toFixed(2);
      const feeAmount = feeQuote.feeAmount.toFixed(2);
      const invoiceDueAt = collectionPlan.invoiceDueAt
        ? new Date(collectionPlan.invoiceDueAt)
        : null;
      const subscriptionId = hasStoredPaymentMethod ? (subscription?.id ?? null) : null;
      const currencyCode = normalizeCurrencyCode(claim.currency);

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

      return {
        success: true,
        data: buildSnapshot({
          claimId: parsed.data.claimId,
          collectionMethod: collectionPlan.method,
          currencyCode,
          deductionAllowed: parsed.data.deductionAllowed,
          feeAmount,
          hasStoredPaymentMethod,
          invoiceDueAt,
          paymentAuthorizationState:
            agreement.paymentAuthorizationState as PaymentAuthorizationState,
          recoveredAmount,
          resolvedAt: now,
          subscriptionId,
        }),
      };
    });
  } catch (error) {
    console.error('Failed to save success-fee collection:', error);
    return { success: false, error: 'Failed to save success-fee collection' };
  }
}
