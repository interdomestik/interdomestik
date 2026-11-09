import type { PaddleTransaction, ProviderSettlement } from './handover-evidence';

/**
 * ACQ-3b §3.7 step 8: charge reconciliation runs daily from the first cancel in every state and
 * closes only at its terminal condition. Retention never purges an intent before that.
 */
const NON_FINAL = new Set(['draft', 'ready', 'billed', 'past_due']);

export type ReconciliationIntent = {
  state: 'pending' | 'cancel_scheduled' | 'void' | 'done' | 'staff_review' | 'closed_by_staff';
  staffDisposition: 'canceled' | 'renewing_as_member' | null;
  cancelDispatchedAt: string | null;
  paidUntil: string | null;
  dispatchPeriodEndsAt: string | null;
  restorationCutoff: string | null;
};

/** Charges are counted from `paid_until` when set, otherwise from the dispatched period end. */
export function chargeBoundary(intent: ReconciliationIntent): string | null {
  return intent.paidUntil ?? intent.dispatchPeriodEndsAt;
}

/** Paid or completed transactions whose billing period starts at or after the boundary. */
export function chargesAfterBoundary(
  intent: ReconciliationIntent,
  transactions: readonly PaddleTransaction[]
): PaddleTransaction[] {
  const boundary = chargeBoundary(intent);
  if (!boundary) return [];
  const from = Date.parse(boundary);
  return transactions.filter(
    transaction =>
      (transaction.status === 'paid' || transaction.status === 'completed') &&
      transaction.billingPeriod !== null &&
      Date.parse(transaction.billingPeriod.startsAt) >= from
  );
}

export function reconciliationMayClose(params: {
  intent: ReconciliationIntent;
  settlement: ProviderSettlement;
  transactions: readonly PaddleTransaction[];
  /** A full scan ran after the intent reached its current state. */
  fullScanAfterState: boolean;
}): boolean {
  const { intent, settlement, transactions, fullScanAfterState } = params;
  if (intent.state === 'void') return intent.cancelDispatchedAt === null;
  if (!fullScanAfterState) return false;
  const canceled =
    intent.state === 'done' ||
    (intent.state === 'closed_by_staff' && intent.staffDisposition === 'canceled');
  if (canceled) return !transactions.some(transaction => NON_FINAL.has(transaction.status));
  if (intent.state !== 'closed_by_staff' || intent.staffDisposition !== 'renewing_as_member') {
    return false;
  }
  if (settlement === 'unresolved') return false;
  const boundary = chargeBoundary(intent);
  if (!boundary || !intent.restorationCutoff) return false;
  const from = Date.parse(boundary);
  const until = Date.parse(intent.restorationCutoff);
  return !transactions.some(transaction => {
    const start = transaction.billingPeriod ? Date.parse(transaction.billingPeriod.startsAt) : null;
    return start !== null && start >= from && start < until && NON_FINAL.has(transaction.status);
  });
}
