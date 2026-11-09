/**
 * ACQ-3b §3.7 steps 2–6: what a Paddle read-back proves. Only positive provider evidence settles
 * anything; elapsed time, a timeout or a negative read-back never does (handoffs 194–196).
 */
export type PaddleReadBack = {
  status: string;
  scheduledChange: { action: string } | null;
  currentBillingPeriod: { startsAt: string; endsAt: string } | null;
};

export type PaddleTransaction = {
  id: string;
  status: string;
  billingPeriod: { startsAt: string } | null;
};

export type ReadBackFinding =
  /** Step 2: clean evidence. `paid_until` is the current period end, keyed by the paid transaction. */
  | { kind: 'evidence'; paidUntil: string; evidenceTransactionId: string }
  /** Observed cancellation: record it, mark unknown attempts moot, staff task, end offer. */
  | { kind: 'canceled' }
  /** Active with no scheduled change: a retry candidate while a linked entry is live. */
  | { kind: 'not_scheduled' }
  /** Step 3: anything else; no `paid_until` is guessed. */
  | { kind: 'staff_review'; reason: 'paddle_state' | 'missing_period' | 'missing_transaction' };

const PAID = new Set(['paid', 'completed']);

const sameInstant = (a: string, b: string): boolean => Date.parse(a) === Date.parse(b);

export function classifyReadBack(
  subscription: PaddleReadBack,
  transactions: readonly PaddleTransaction[]
): ReadBackFinding {
  if (subscription.status === 'canceled') return { kind: 'canceled' };
  if (subscription.status !== 'active') return { kind: 'staff_review', reason: 'paddle_state' };
  if (subscription.scheduledChange?.action !== 'cancel') {
    return subscription.scheduledChange
      ? { kind: 'staff_review', reason: 'paddle_state' }
      : { kind: 'not_scheduled' };
  }
  const period = subscription.currentBillingPeriod;
  if (!period) return { kind: 'staff_review', reason: 'missing_period' };
  const paid = transactions.find(
    transaction =>
      PAID.has(transaction.status) &&
      transaction.billingPeriod !== null &&
      sameInstant(transaction.billingPeriod.startsAt, period.startsAt)
  );
  if (!paid) return { kind: 'staff_review', reason: 'missing_transaction' };
  return { kind: 'evidence', paidUntil: period.endsAt, evidenceTransactionId: paid.id };
}

export type AttemptOutcome = 'unknown' | 'scheduled' | 'refused' | 'moot';

/**
 * An attempt is resolved only by its own response: `scheduled` when that response shows a
 * scheduled cancel, `refused` on that request's own definite error. A timeout or transport error
 * stays `unknown`; only an observed `canceled` later makes it `moot`.
 */
export function attemptOutcomeFromResponse(
  response:
    | { kind: 'ok'; subscription: PaddleReadBack }
    | { kind: 'definite_error' }
    | { kind: 'indeterminate' }
): AttemptOutcome {
  if (response.kind === 'definite_error') return 'refused';
  if (response.kind === 'indeterminate') return 'unknown';
  return response.subscription.scheduledChange?.action === 'cancel' ? 'scheduled' : 'unknown';
}

export type ProviderSettlement = 'unsent' | 'unresolved' | 'resolved';

/** Derived from the attempts only; no staff action and no elapsed time changes it. */
export function providerSettlement(
  attempts: readonly { outcome: AttemptOutcome }[]
): ProviderSettlement {
  if (attempts.length === 0) return 'unsent';
  return attempts.some(attempt => attempt.outcome === 'unknown') ? 'unresolved' : 'resolved';
}
