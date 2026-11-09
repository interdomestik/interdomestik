import {
  and,
  eq,
  inArray,
  isNull,
  sponsorHandoverCancelAttempts,
  sponsorHandoverCharges,
  sponsorHandoverIntents,
  sponsorMailOutbox,
  sponsorRosterEntries,
  type TenantTransaction,
} from '@interdomestik/database';
import { nanoid } from 'nanoid';

import { produceEntryStarts } from '../sponsor-coverage/entry-start';
import type { AttemptOutcome } from '../sponsor-coverage/handover-evidence';
import { SPONSOR_SYSTEM_ACTOR, writeSponsorAudit } from './audit';
import type { HandoverState } from './handover-intent-read';
import type { HandoverPlan } from './handover-plan';
import { persistHandoverIntent } from './handover-intent-persist';
import {
  recordHandoverScheduleConfirmation,
  recordScheduledHandoverTask,
} from './handover-scheduled-tasks.core';

export type DispatchTicket = { attemptId: string; providerSubscriptionId: string };

const iso = (value: Date): string => value.toISOString();

/**
 * Writes one plan under the intent lock taken by `readHandoverState`. Returns the attempt to send
 * when the plan dispatches: the attempt row (outcome `unknown`) and the dispatch record commit
 * with this transaction, before Paddle is called (step 1, "attempt record first").
 */
export async function applyHandoverPlan(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    state: HandoverState;
    plan: HandoverPlan;
    now: Date;
    hasCredential: (userId: string) => Promise<boolean>;
  }
): Promise<DispatchTicket | null> {
  const { tenantId, state, plan, now } = params;
  const { intent } = state;

  if (plan.charges.length > 0) {
    await tx
      .insert(sponsorHandoverCharges)
      .values(
        plan.charges.map(charge => ({
          id: `sphc_${nanoid()}`,
          tenantId,
          intentId: intent.id,
          providerTransactionId: charge.id,
          billingPeriodStartsAt: charge.billingPeriod?.startsAt ?? iso(now),
        }))
      )
      .onConflictDoNothing({ target: sponsorHandoverCharges.providerTransactionId });
  }
  if (plan.observedCancel) {
    await tx
      .update(sponsorHandoverCancelAttempts)
      .set({ outcome: 'moot', resolvedAt: iso(now) })
      .where(
        and(
          eq(sponsorHandoverCancelAttempts.tenantId, tenantId),
          eq(sponsorHandoverCancelAttempts.intentId, intent.id),
          eq(sponsorHandoverCancelAttempts.outcome, 'unknown')
        )
      );
  }
  if (plan.scheduledCancelAt) {
    await recordScheduledHandoverTask(tx, tenantId, intent.id, plan.scheduledCancelAt);
  }
  if (plan.scheduleConfirmed && state.attempts.length > 0) {
    const newestAttemptNo = Math.max(...state.attempts.map(attempt => attempt.attemptNo));
    await recordHandoverScheduleConfirmation(tx, tenantId, intent.id, newestAttemptNo);
  }
  await updateEntries(tx, tenantId, plan);
  if (plan.endOffer) {
    await tx
      .insert(sponsorMailOutbox)
      .values({
        id: nanoid(),
        tenantId,
        handoverIntentId: intent.id,
        userId: intent.userId,
        kind: 'membership_end_offer',
        idempotencyKey: `sponsor-intent:${intent.id}:membership_end_offer`,
      })
      .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
  }

  const ticket = plan.dispatch ? await recordAttempt(tx, tenantId, state, plan, now) : null;
  await persistHandoverIntent(tx, tenantId, state, plan, now, ticket);

  if (plan.nextState && plan.nextState !== intent.state) {
    await writeSponsorAudit(tx, tenantId, [
      {
        action: 'sponsor_intent.state',
        entityType: 'sponsor_handover_intent',
        entityId: intent.id,
        ...SPONSOR_SYSTEM_ACTOR,
        metadata: {
          previousState: intent.state,
          state: plan.nextState,
          ...(plan.evidence ? { evidenceId: plan.evidence.transactionId } : {}),
        },
      },
    ]);
  }

  // Producer runs after the evidence is durable in this transaction (step 2).
  if (plan.startEntries.length > 0) {
    await produceEntryStarts(tx, {
      tenantId,
      starts: plan.startEntries,
      handover: true,
      hasCredential: await params.hasCredential(intent.userId),
    });
  }
  return ticket;
}

async function updateEntries(tx: TenantTransaction, tenantId: string, plan: HandoverPlan) {
  if (plan.emptyIntervalEntries.length > 0) {
    await tx
      .update(sponsorRosterEntries)
      .set({ outcome: 'staff_review', reviewReason: 'empty_interval' })
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          inArray(sponsorRosterEntries.id, plan.emptyIntervalEntries)
        )
      );
  }
  if (plan.reopenEntries.length > 0) {
    await tx
      .update(sponsorRosterEntries)
      .set({ outcome: 'pending', reviewReason: null })
      .where(
        and(
          eq(sponsorRosterEntries.tenantId, tenantId),
          inArray(sponsorRosterEntries.id, plan.reopenEntries),
          isNull(sponsorRosterEntries.startsAt)
        )
      );
  }
}

/** The attempt transaction: re-checked boundary (the plan), attempt row, dispatch record, mail. */
async function recordAttempt(
  tx: TenantTransaction,
  tenantId: string,
  state: HandoverState,
  plan: HandoverPlan,
  now: Date
): Promise<DispatchTicket | null> {
  const { intent, attempts, linked } = state;
  const authorization = plan.dispatch;
  if (!authorization) return null;
  const attemptId = `spha_${nanoid()}`;
  const attemptNo = (attempts.at(-1)?.attemptNo ?? 0) + 1;
  await tx.insert(sponsorHandoverCancelAttempts).values({
    id: attemptId,
    tenantId,
    intentId: intent.id,
    attemptNo,
    dispatchedAt: iso(now),
    authorizingEntryId: authorization.authorizingEntryId,
    authorizingTermId: authorization.authorizingTermId,
    authorizingTermStart: iso(authorization.authorizingTermStart),
    authorizingEnd: iso(authorization.authorizingEnd),
    boundaryAt: iso(authorization.boundaryAt),
    outcome: 'unknown',
  });
  if (intent.cancelDispatchedAt === null && intent.state === 'pending') {
    await tx
      .update(sponsorHandoverIntents)
      .set({ cancelDispatchedAt: iso(now), dispatchPeriodEndsAt: iso(authorization.boundaryAt) })
      .where(
        and(
          eq(sponsorHandoverIntents.tenantId, tenantId),
          eq(sponsorHandoverIntents.id, intent.id),
          eq(sponsorHandoverIntents.state, 'pending'),
          isNull(sponsorHandoverIntents.cancelDispatchedAt)
        )
      );
  }
  await tx
    .update(sponsorHandoverIntents)
    .set({ attempts: intent.attempts + 1 })
    .where(
      and(eq(sponsorHandoverIntents.tenantId, tenantId), eq(sponsorHandoverIntents.id, intent.id))
    );
  // `handover_pending` once per linked entry, first in a transaction that passed the check.
  const recipients = linked.filter(entry => entry.revokedAt === null).map(entry => entry.id);
  if (recipients.length > 0) {
    await tx
      .insert(sponsorMailOutbox)
      .values(
        recipients.map(entryId => ({
          id: nanoid(),
          tenantId,
          rosterEntryId: entryId,
          kind: 'handover_pending' as const,
          idempotencyKey: `sponsor-entry:${entryId}:handover_pending`,
        }))
      )
      .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey });
  }
  return { attemptId, providerSubscriptionId: intent.providerSubscriptionId };
}

/** Resolves one attempt by its own response only; a refusal sends an active intent to staff. */
export async function resolveAttempt(
  tx: TenantTransaction,
  params: {
    tenantId: string;
    intentId: string;
    attemptId: string;
    outcome: AttemptOutcome;
    evidenceRef: string | null;
    now: Date;
  }
): Promise<void> {
  const { tenantId, intentId } = params;
  const [intent] = await tx
    .select({ state: sponsorHandoverIntents.state })
    .from(sponsorHandoverIntents)
    .where(
      and(eq(sponsorHandoverIntents.tenantId, tenantId), eq(sponsorHandoverIntents.id, intentId))
    )
    .for('update');
  if (!intent || params.outcome === 'unknown') return;
  await tx
    .update(sponsorHandoverCancelAttempts)
    .set({ outcome: params.outcome, evidenceRef: params.evidenceRef, resolvedAt: iso(params.now) })
    .where(
      and(
        eq(sponsorHandoverCancelAttempts.tenantId, tenantId),
        eq(sponsorHandoverCancelAttempts.id, params.attemptId),
        eq(sponsorHandoverCancelAttempts.outcome, 'unknown')
      )
    );
  if (
    params.outcome === 'refused' &&
    (intent.state === 'pending' || intent.state === 'cancel_scheduled')
  ) {
    await tx
      .update(sponsorHandoverIntents)
      .set({ state: 'staff_review', updatedAt: iso(params.now) })
      .where(
        and(eq(sponsorHandoverIntents.tenantId, tenantId), eq(sponsorHandoverIntents.id, intentId))
      );
    await writeSponsorAudit(tx, tenantId, [
      {
        action: 'sponsor_intent.state',
        entityType: 'sponsor_handover_intent',
        entityId: intentId,
        ...SPONSOR_SYSTEM_ACTOR,
        metadata: { previousState: intent.state, state: 'staff_review' },
      },
    ]);
  }
}
