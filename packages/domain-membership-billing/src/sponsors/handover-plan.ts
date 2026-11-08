import {
  type CoverageEntry,
  entryEnd,
  type EntryInterval,
  isEligible,
} from '../sponsor-coverage/evaluate';
import {
  checkDispatchBoundary,
  type DispatchAuthorization,
  isLiveEntry,
} from '../sponsor-coverage/handover-boundary';
import {
  classifyReadBack,
  type PaddleReadBack,
  type PaddleTransaction,
  providerSettlement,
} from '../sponsor-coverage/handover-evidence';
import {
  chargesAfterBoundary,
  type ReconciliationIntent,
  reconciliationMayClose,
} from '../sponsor-coverage/handover-reconciliation';
import type { HandoverSubscription } from './paddle-handover-client';
import type { HandoverState } from './handover-intent-read';

type IntentState = ReconciliationIntent['state'];

/**
 * ACQ-3b §3.7 steps 1–8 for one intent, decided from its locked rows and one Paddle read-back.
 * The applier writes the plan in the same transaction; a dispatch is committed before the call.
 */
export type HandoverPlan = {
  charges: PaddleTransaction[];
  /** First observation of `canceled`: record it and mark `unknown` attempts `moot`. */
  observedCancel: boolean;
  scheduledCancelAt: string | null;
  nextState: IntentState | null;
  evidence: { paidUntil: string; transactionId: string } | null;
  /** Entries the entry-start producer runs for (step 2). */
  startEntries: { entryId: string; interval: EntryInterval }[];
  /** Entries whose prospective interval is empty on a refused first cancel. */
  emptyIntervalEntries: string[];
  /** Linked entries returned to provisioning after the member's own cancellation. */
  reopenEntries: string[];
  /** Queue the intent-addressed `membership_end_offer`. */
  endOffer: boolean;
  dispatch: DispatchAuthorization | null;
  closeReconciliation: boolean;
  nextRunAt: Date;
};

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const ACTIVE: ReadonlySet<IntentState> = new Set(['pending', 'cancel_scheduled']);

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);

/** Retry backoff: 5 minutes doubling per attempt, at most daily; never a limit (step 4). */
export function retryDelayMs(attempts: number): number {
  return Math.min(5 * MINUTE_MS * 2 ** Math.min(Math.max(attempts, 0), 12), DAY_MS);
}

export function planHandoverStep(
  state: HandoverState,
  readBack: PaddleReadBack &
    Partial<Pick<HandoverSubscription, 'nextBilledAt' | 'scheduledChange'>>,
  transactions: readonly PaddleTransaction[],
  now: Date
): HandoverPlan {
  const { intent, linked, attempts } = state;
  const plan: HandoverPlan = {
    charges: chargesAfterBoundary(intent, transactions),
    observedCancel: false,
    scheduledCancelAt: null,
    nextState: null,
    evidence: null,
    startEntries: [],
    emptyIntervalEntries: [],
    reopenEntries: [],
    endOffer: false,
    dispatch: null,
    closeReconciliation: false,
    nextRunAt: new Date(now.getTime() + DAY_MS),
  };
  if (readBack.status === 'active' && readBack.scheduledChange?.action === 'cancel') {
    const effectiveAt = readBack.scheduledChange.effectiveAt;
    if (effectiveAt && Number.isFinite(Date.parse(effectiveAt))) {
      plan.scheduledCancelAt = new Date(effectiveAt).toISOString();
    }
  }
  const paidUntil = intent.paidUntil ? new Date(intent.paidUntil) : null;

  if (readBack.status === 'canceled') {
    observeCancellation(plan, state, now);
  } else if (ACTIVE.has(intent.state)) {
    const live = linked.filter(entry => isLiveEntry(entry, now, paidUntil));
    if (live.length === 0) {
      noLiveEntry(plan, intent);
    } else {
      planLive(plan, state, readBack, transactions, now, paidUntil);
    }
  }

  // A scheduled cancel is a staff task only when nothing wants it: the worker's own cancel for a
  // live linked entry is the intended outcome, not a task (§3.7 "Observed cancellation").
  if (ACTIVE.has(intent.state) && linked.some(entry => isLiveEntry(entry, now, paidUntil))) {
    plan.scheduledCancelAt = null;
  }
  const finalState = plan.nextState ?? intent.state;
  plan.closeReconciliation = reconciliationMayClose({
    intent: { ...intent, state: finalState },
    settlement: providerSettlement(
      plan.observedCancel
        ? attempts.map(attempt => ({
            outcome: attempt.outcome === 'unknown' ? ('moot' as const) : attempt.outcome,
          }))
        : attempts
    ),
    transactions,
    fullScanAfterState: plan.nextState === null,
  });
  if (finalState === 'pending' && !plan.dispatch) {
    plan.nextRunAt = new Date(now.getTime() + retryDelayMs(intent.attempts));
  }
  // Every cancel, the first and each retry, backs off by the attempts already made (step 4).
  if (plan.dispatch) plan.nextRunAt = new Date(now.getTime() + retryDelayMs(intent.attempts));
  // Enforce the locked retry deadline after computing observation and reconciliation effects.
  if (plan.dispatch && intent.nextAttemptAt && Date.parse(intent.nextAttemptAt) > now.getTime()) {
    plan.dispatch = null;
    plan.nextRunAt = new Date(intent.nextAttemptAt);
  }
  return plan;
}

/** Observed cancellation, in every state (round 15, finding 2). */
function observeCancellation(plan: HandoverPlan, state: HandoverState, now: Date): void {
  const { intent, linked } = state;
  plan.observedCancel = intent.canceledConfirmedAt === null;
  plan.endOffer = plan.observedCancel;
  if (intent.state === 'pending' && intent.cancelDispatchedAt === null) {
    // The member cancelled on their own: void, and live entries take the immediate path.
    plan.nextState = 'void';
    plan.reopenEntries = linked
      .filter(entry => isEligible(entry) && now < entryEnd(entry))
      .filter(entry => entry.outcome === 'awaiting_paid_end' && entry.startsAt === null)
      .map(entry => entry.id);
  } else if (
    intent.state === 'pending' ||
    intent.state === 'cancel_scheduled' ||
    intent.state === 'staff_review' ||
    (intent.state === 'done' && intent.paidUntil === null)
  ) {
    plan.nextState = intent.paidUntil === null ? 'staff_review' : 'done';
  }
}

/** Step 6: no linked entry is live any more. */
function noLiveEntry(plan: HandoverPlan, intent: HandoverState['intent']): void {
  if (intent.state === 'pending') {
    plan.nextState = intent.cancelDispatchedAt === null ? 'void' : 'staff_review';
  } else {
    plan.nextState = 'staff_review';
    plan.endOffer = true;
  }
}

function planLive(
  plan: HandoverPlan,
  state: HandoverState,
  readBack: PaddleReadBack &
    Partial<Pick<HandoverSubscription, 'nextBilledAt' | 'scheduledChange'>>,
  transactions: readonly PaddleTransaction[],
  now: Date,
  paidUntil: Date | null
): void {
  const { intent, linked } = state;
  const finding = classifyReadBack(readBack, transactions);
  if (finding.kind === 'evidence') {
    if (paidUntil) return;
    const until = new Date(finding.paidUntil);
    plan.evidence = { paidUntil: finding.paidUntil, transactionId: finding.evidenceTransactionId };
    plan.nextState = 'cancel_scheduled';
    plan.startEntries = linked
      .filter(entry => isEligible(entry))
      .map(entry => ({
        entryId: entry.id,
        interval: { start: later(entry.termStart, until), end: entryEnd(entry) },
      }));
    return;
  }
  if (finding.kind === 'staff_review') {
    plan.nextState = 'staff_review';
    return;
  }
  if (finding.kind !== 'not_scheduled') return;
  const nextBilledAt = readBack.nextBilledAt ? Date.parse(readBack.nextBilledAt) : NaN;
  if (!Number.isFinite(nextBilledAt)) {
    // Missing provider timing cannot authorize a cancel; use the existing staff recovery path.
    plan.nextState = 'staff_review';
    return;
  }
  if (nextBilledAt - now.getTime() < DAY_MS) return;
  const boundaryText = readBack.currentBillingPeriod?.endsAt;
  if (!boundaryText) {
    plan.nextState = 'staff_review';
    return;
  }
  const boundary = new Date(boundaryText);
  const decision = checkDispatchBoundary(linked, boundary, now, paidUntil);
  if (decision.action === 'dispatch') {
    plan.dispatch = decision.authorization;
    return;
  }
  if (decision.action === 'defer') return;
  if (paidUntil) {
    // Entries keep their derived intervals; an intent-level staff task (step 1, refusal).
    plan.nextState = 'staff_review';
    return;
  }
  plan.emptyIntervalEntries = emptyProspective(linked, boundary, now);
  noLiveEntry(plan, intent);
}

/** Live entries whose interval would start at `B` and is therefore empty. */
function emptyProspective(linked: readonly CoverageEntry[], boundary: Date, now: Date): string[] {
  return linked
    .filter(entry => isLiveEntry(entry, now, null))
    .filter(entry => later(entry.termStart, boundary).getTime() >= entryEnd(entry).getTime())
    .map(entry => entry.id);
}
