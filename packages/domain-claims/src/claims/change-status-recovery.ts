import {
  and,
  asc,
  claims,
  eq,
  membershipPlans,
  sponsorRosterEntries,
  sponsorTerms,
  sql,
  subscriptions,
  user,
  type TenantTransaction,
} from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { lockPersonCoverageInputs } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { inArray, or, type SQL } from 'drizzle-orm';

import {
  buildCommercialAgreementSnapshot,
  buildSuccessFeeCollectionSnapshot,
} from '../staff-claims/accepted-recovery-prerequisites';
import { buildCommercialHandlingScopeSnapshot } from '../staff-claims/commercial-handling-scope';
import {
  getMatterAllowanceContextForSubscription,
  getMatterAllowanceSubscriptionContextForUser,
  getRecoveryMatterServiceCode,
  hasRecoveryMatterUsageForClaim,
  lockRecoveryMatterAllowance,
} from '../staff-claims/matter-allowance';
import type { LockedClaimStatusAgreement } from './change-status-agreement';

export type RecoveryPrerequisite =
  'commercial_scope' | 'decision' | 'agreement' | 'collection_path' | 'membership' | 'allowance';

export type RecoveryUsage = {
  serviceCode: string;
  subscriptionId: string;
  userId: string;
  usedAt: Date;
};

type AllowanceSnapshot = { userId: string; subscriptionId: string | null };

export function isRecoveryStatus(status: ClaimStatus): boolean {
  return status === 'negotiation' || status === 'court';
}

export async function lockRecoveryAllowanceBeforeClaim(
  tx: TenantTransaction,
  tenantId: string,
  scope: SQL
): Promise<AllowanceSnapshot | undefined> {
  // The claim scope applies even to the unlocked read used to identify the advisory key.
  const [snapshot] = await tx
    .select({ userId: claims.userId, subscriptionId: subscriptions.id })
    .from(claims)
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.userId, claims.userId))
    )
    .where(scope)
    .limit(1);

  if (snapshot?.subscriptionId) {
    await lockRecoveryMatterAllowance({ tx, tenantId }, snapshot.subscriptionId);
  }
  return snapshot;
}

function checkRecoveryAgreement(params: {
  category: string | null | undefined;
  claimId: string;
  agreement: LockedClaimStatusAgreement | undefined;
}): RecoveryPrerequisite | null {
  const { category, claimId, agreement } = params;
  if (!buildCommercialHandlingScopeSnapshot({ claimCategory: category }).isEligible) {
    return 'commercial_scope';
  }
  if (agreement?.decisionType !== 'accepted') return 'decision';
  if (!buildCommercialAgreementSnapshot({ claimId, ...agreement })) return 'agreement';

  const collection = buildSuccessFeeCollectionSnapshot({
    claimId,
    collectionMethod: agreement.successFeeCollectionMethod,
    currencyCode: agreement.successFeeCurrencyCode,
    deductionAllowed: agreement.successFeeDeductionAllowed,
    feeAmount: agreement.successFeeAmount,
    hasStoredPaymentMethod: agreement.successFeeHasStoredPaymentMethod,
    invoiceDueAt: agreement.successFeeInvoiceDueAt,
    paymentAuthorizationState: agreement.paymentAuthorizationState,
    recoveredAmount: agreement.successFeeRecoveredAmount,
    resolvedAt: agreement.successFeeResolvedAt,
    subscriptionId: agreement.successFeeSubscriptionId,
  });
  return collection ? null : 'collection_path';
}

async function readAllowanceSubscription(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  lock: boolean
) {
  const query = tx
    .select({ id: subscriptions.id, planKey: subscriptions.planKey })
    .from(subscriptions)
    .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.userId, userId)))
    .limit(1);
  const [subscription] = await (lock ? query.for('share') : query);
  return subscription;
}

export async function matchesRecoveryAllowanceLock(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  snapshot: AllowanceSnapshot | undefined
): Promise<boolean> {
  if (snapshot?.userId !== userId) return false;
  const current = await readAllowanceSubscription(tx, tenantId, userId, false);
  return snapshot.subscriptionId === (current?.id ?? null);
}

async function lockEntitlementRows(tx: TenantTransaction, tenantId: string, userId: string) {
  await lockPersonCoverageInputs(tx, tenantId, userId);

  await tx
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.id, userId)))
    .for('share');

  const subscription = await readAllowanceSubscription(tx, tenantId, userId, true);
  const sponsorPlanKeys = tx
    .select({ planKey: sponsorTerms.planKey })
    .from(sponsorTerms)
    .innerJoin(
      sponsorRosterEntries,
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        eq(sponsorRosterEntries.termId, sponsorTerms.id),
        eq(sponsorRosterEntries.userId, userId)
      )
    )
    .where(eq(sponsorTerms.tenantId, tenantId));
  await tx
    .select({ id: membershipPlans.id })
    .from(membershipPlans)
    .where(
      and(
        eq(membershipPlans.tenantId, tenantId),
        or(
          subscription?.planKey ? eq(membershipPlans.id, subscription.planKey) : undefined,
          inArray(membershipPlans.id, sponsorPlanKeys)
        )
      )
    )
    .orderBy(asc(membershipPlans.id))
    .for('share');

  return subscription?.id ?? null;
}

type CheckRecoveryOutcome =
  | { ok: true; usage: RecoveryUsage | null }
  | { ok: false; code: 'conflict' | `recovery_prerequisite:${RecoveryPrerequisite}` };

export async function checkClaimStatusRecovery(
  tx: TenantTransaction,
  params: {
    agreement: LockedClaimStatusAgreement | undefined;
    allowanceSnapshot: AllowanceSnapshot | undefined;
    category: string | null | undefined;
    claimId: string;
    overrideReason: string | undefined;
    tenantId: string;
    userId: string;
  }
): Promise<CheckRecoveryOutcome> {
  const { allowanceSnapshot, claimId, tenantId, userId } = params;
  const agreementFailure = checkRecoveryAgreement(params);
  if (agreementFailure) return { ok: false, code: `recovery_prerequisite:${agreementFailure}` };

  const subscriptionId = await lockEntitlementRows(tx, tenantId, userId);
  // Never take a new advisory key with the claim locked, including after waiting on a sponsor writer.
  if (subscriptionId !== allowanceSnapshot?.subscriptionId) return { ok: false, code: 'conflict' };

  const [clock] = await tx
    .select({
      epochMs: sql<number>`(extract(epoch from clock_timestamp()) * 1000)::double precision`,
    })
    .from(sql`(values (1)) as entitlement_clock(once)`);
  const effectiveAt = new Date(clock?.epochMs ?? Number.NaN);
  if (Number.isNaN(effectiveAt.getTime()))
    throw new Error('Unreadable recovery allowance timestamp');

  const subscription = await getMatterAllowanceSubscriptionContextForUser(
    { tx, tenantId, userId },
    effectiveAt
  );
  if (!subscription) return { ok: false, code: 'recovery_prerequisite:membership' };
  if (subscription.subscriptionId !== subscriptionId) return { ok: false, code: 'conflict' };

  const allowance = await getMatterAllowanceContextForSubscription(
    { tx, tenantId, subscription },
    { lockUsage: false, now: effectiveAt }
  );
  if (await hasRecoveryMatterUsageForClaim({ tx, tenantId, claimId, subscriptionId })) {
    return { ok: true, usage: null };
  }
  if (allowance.consumedCount >= allowance.allowanceTotal && !params.overrideReason) {
    return { ok: false, code: 'recovery_prerequisite:allowance' };
  }

  return {
    ok: true,
    usage: {
      serviceCode: getRecoveryMatterServiceCode(claimId),
      subscriptionId,
      userId,
      usedAt: effectiveAt,
    },
  };
}
