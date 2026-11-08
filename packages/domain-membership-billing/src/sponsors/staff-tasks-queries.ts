import {
  and,
  eq,
  inArray,
  isNull,
  sponsorHandoverCancelAttempts,
  sponsorHandoverCharges,
  sponsorHandoverIntents,
  sponsorRosterEntries,
  sponsorTerms,
  subscriptions,
  type TenantTransaction,
} from '@interdomestik/database';
import { gte, isNotNull, or } from 'drizzle-orm';

/** §3.7 step 4: a pending cancel still retrying after this many attempts is also a staff task. */
export const HANDOVER_ESCALATION_ATTEMPTS = 5;

/**
 * ACQ-3b staff-task queue (§3.7, §3.6.1, §3.9): the durable rows each task is derived from. Each
 * reader is one statement with the tenant predicate; none takes a lock.
 */
export async function readTaskIntents(tx: TenantTransaction, tenantId: string) {
  return tx
    .select({
      id: sponsorHandoverIntents.id,
      userId: sponsorHandoverIntents.userId,
      state: sponsorHandoverIntents.state,
      canceledConfirmedAt: sponsorHandoverIntents.canceledConfirmedAt,
      attempts: sponsorHandoverIntents.attempts,
      updatedAt: sponsorHandoverIntents.updatedAt,
    })
    .from(sponsorHandoverIntents)
    .where(
      and(
        eq(sponsorHandoverIntents.tenantId, tenantId),
        or(
          eq(sponsorHandoverIntents.state, 'staff_review'),
          isNotNull(sponsorHandoverIntents.canceledConfirmedAt),
          and(
            eq(sponsorHandoverIntents.state, 'pending'),
            gte(sponsorHandoverIntents.attempts, HANDOVER_ESCALATION_ATTEMPTS)
          )
        )
      )
    );
}

/** Open re-cancellations, with every attempt so the newest five can be evaluated together. */
export async function readRecancellationAttempts(
  tx: TenantTransaction,
  tenantId: string
): Promise<
  {
    intentId: string;
    userId: string;
    attempts: number;
    attemptNo: number;
    outcome: string;
    dispatchedAt: string;
  }[]
> {
  return tx
    .select({
      intentId: sponsorHandoverIntents.id,
      userId: sponsorHandoverIntents.userId,
      attempts: sponsorHandoverIntents.attempts,
      attemptNo: sponsorHandoverCancelAttempts.attemptNo,
      outcome: sponsorHandoverCancelAttempts.outcome,
      dispatchedAt: sponsorHandoverCancelAttempts.dispatchedAt,
    })
    .from(sponsorHandoverCancelAttempts)
    .innerJoin(
      sponsorHandoverIntents,
      and(
        eq(sponsorHandoverIntents.tenantId, sponsorHandoverCancelAttempts.tenantId),
        eq(sponsorHandoverIntents.id, sponsorHandoverCancelAttempts.intentId)
      )
    )
    .where(
      and(
        eq(sponsorHandoverCancelAttempts.tenantId, tenantId),
        eq(sponsorHandoverIntents.state, 'cancel_scheduled'),
        isNull(sponsorHandoverIntents.reconciliationClosedAt)
      )
    );
}

export async function readOpenCharges(tx: TenantTransaction, tenantId: string) {
  return tx
    .select({
      id: sponsorHandoverCharges.id,
      intentId: sponsorHandoverCharges.intentId,
      userId: sponsorHandoverIntents.userId,
      providerTransactionId: sponsorHandoverCharges.providerTransactionId,
      billingPeriodStartsAt: sponsorHandoverCharges.billingPeriodStartsAt,
      foundAt: sponsorHandoverCharges.foundAt,
    })
    .from(sponsorHandoverCharges)
    .innerJoin(
      sponsorHandoverIntents,
      and(
        eq(sponsorHandoverIntents.tenantId, sponsorHandoverCharges.tenantId),
        eq(sponsorHandoverIntents.id, sponsorHandoverCharges.intentId)
      )
    )
    .where(
      and(eq(sponsorHandoverCharges.tenantId, tenantId), isNull(sponsorHandoverCharges.staffTaskId))
    );
}

/** Entries that are in staff review, rejected at admission, or bound (for the activation list). */
export async function readTaskEntries(tx: TenantTransaction, tenantId: string) {
  return tx
    .select({
      id: sponsorRosterEntries.id,
      termId: sponsorRosterEntries.termId,
      sponsorId: sponsorTerms.sponsorId,
      userId: sponsorRosterEntries.userId,
      outcome: sponsorRosterEntries.outcome,
      reviewReason: sponsorRosterEntries.reviewReason,
      conflictDecision: sponsorRosterEntries.conflictDecision,
      revokedAt: sponsorRosterEntries.revokedAt,
      termEnd: sponsorTerms.termEnd,
      terminatedEffectiveAt: sponsorTerms.terminatedEffectiveAt,
    })
    .from(sponsorRosterEntries)
    .innerJoin(
      sponsorTerms,
      and(
        eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorTerms.id, sponsorRosterEntries.termId)
      )
    )
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        or(
          eq(sponsorRosterEntries.outcome, 'staff_review'),
          eq(sponsorRosterEntries.conflictDecision, 'rejected'),
          isNotNull(sponsorRosterEntries.userId)
        )
      )
    );
}

/** Paddle rows of covered people that can still collect payment and have no handover intent. */
export async function readUnhandledPaddleRows(
  tx: TenantTransaction,
  tenantId: string,
  userIds: readonly string[]
) {
  if (userIds.length === 0) return [];
  return tx
    .select({ subscriptionId: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .leftJoin(
      sponsorHandoverIntents,
      and(
        eq(sponsorHandoverIntents.tenantId, subscriptions.tenantId),
        eq(sponsorHandoverIntents.subscriptionId, subscriptions.id)
      )
    )
    .where(
      and(
        eq(subscriptions.tenantId, tenantId),
        eq(subscriptions.provider, 'paddle'),
        inArray(subscriptions.status, ['active', 'trialing', 'past_due', 'paused']),
        inArray(subscriptions.userId, [...userIds]),
        isNull(sponsorHandoverIntents.id)
      )
    );
}
