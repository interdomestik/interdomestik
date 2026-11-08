import { describe, expect, it } from 'vitest';

import type { CoverageEntry } from '../sponsor-coverage/evaluate';
import type { PaddleReadBack } from '../sponsor-coverage/handover-evidence';
import type { HandoverState, IntentSnapshot } from './handover-intent-read';
import { planHandoverStep, retryDelayMs } from './handover-plan';

const d = (value: string): Date => new Date(value);
const now = d('2027-01-10T00:00:00Z');

const entry = (over: Partial<CoverageEntry> = {}): CoverageEntry => ({
  id: 'spe_1',
  sponsorId: 'spn_1',
  termId: 'spt_1',
  termStart: d('2027-01-01T00:00:00Z'),
  termEnd: d('2028-01-01T00:00:00Z'),
  terminatedEffectiveAt: null,
  termEffective: true,
  planId: 'standard',
  planKey: 'plan_1',
  legalEntityId: 'le_ks',
  conflictDecision: 'accepted',
  revokedAt: null,
  outcome: 'awaiting_paid_end',
  startsAt: null,
  handoverPaidUntil: null,
  ...over,
});

const intent = (over: Partial<IntentSnapshot> = {}): IntentSnapshot => ({
  id: 'sph_1',
  userId: 'usr_1',
  providerSubscriptionId: 'sub_p1',
  state: 'pending',
  staffDisposition: null,
  cancelDispatchedAt: null,
  dispatchPeriodEndsAt: null,
  restorationCutoff: null,
  attempts: 0,
  paidUntil: null,
  paidUntilEvidence: null,
  canceledConfirmedAt: null,
  reconciliationClosedAt: null,
  ...over,
});

const state = (over: Partial<HandoverState> = {}): HandoverState => ({
  intent: intent(),
  linked: [entry()],
  attempts: [],
  ...over,
});

const active = (endsAt: string, scheduled = false): PaddleReadBack => ({
  status: 'active',
  scheduledChange: scheduled ? { action: 'cancel' } : null,
  currentBillingPeriod: { startsAt: '2026-12-15T00:00:00Z', endsAt },
});

describe('planHandoverStep', () => {
  it('dispatches when a live entry covers the period end the cancel would produce', () => {
    const plan = planHandoverStep(state(), active('2027-01-15T00:00:00Z'), [], now);
    expect(plan.dispatch).toMatchObject({
      authorizingEntryId: 'spe_1',
      boundaryAt: d('2027-01-15T00:00:00Z'),
    });
    expect(plan.nextState).toBeNull();
    expect(plan.nextRunAt.getTime() - now.getTime()).toBe(5 * 60_000);
  });

  it('defers while every live entry starts after the boundary', () => {
    const later = entry({ termStart: d('2027-03-01T00:00:00Z') });
    const plan = planHandoverStep(
      state({ linked: [later] }),
      active('2027-01-15T00:00:00Z'),
      [],
      now
    );
    expect(plan.dispatch).toBeNull();
    expect(plan.nextState).toBeNull();
    expect(plan.emptyIntervalEntries).toEqual([]);
  });

  it('refuses a first cancel that would leave an empty interval and voids the unsent intent', () => {
    const short = entry({ terminatedEffectiveAt: d('2027-01-12T00:00:00Z') });
    const plan = planHandoverStep(
      state({ linked: [short] }),
      active('2027-01-15T00:00:00Z'),
      [],
      now
    );
    expect(plan.dispatch).toBeNull();
    expect(plan.emptyIntervalEntries).toEqual(['spe_1']);
    expect(plan.nextState).toBe('void');
    expect(plan.closeReconciliation).toBe(true);
  });

  it('publishes clean evidence and starts linked entries at max(term_start, paid_until)', () => {
    const plan = planHandoverStep(
      state({ intent: intent({ cancelDispatchedAt: '2027-01-05T00:00:00Z' }) }),
      active('2027-01-15T00:00:00Z', true),
      [{ id: 'txn_1', status: 'paid', billingPeriod: { startsAt: '2026-12-15T00:00:00Z' } }],
      now
    );
    expect(plan.evidence).toEqual({ paidUntil: '2027-01-15T00:00:00Z', transactionId: 'txn_1' });
    expect(plan.nextState).toBe('cancel_scheduled');
    expect(plan.startEntries).toEqual([
      {
        entryId: 'spe_1',
        interval: { start: d('2027-01-15T00:00:00Z'), end: d('2028-01-01T00:00:00Z') },
      },
    ]);
  });

  it("voids a never-sent intent on the member's own cancellation and reopens its entries", () => {
    const plan = planHandoverStep(
      state(),
      { status: 'canceled', scheduledChange: null, currentBillingPeriod: null },
      [],
      now
    );
    expect(plan.observedCancel).toBe(true);
    expect(plan.nextState).toBe('void');
    expect(plan.reopenEntries).toEqual(['spe_1']);
    expect(plan.endOffer).toBe(true);
  });

  it('marks a dispatched intent done on observed cancellation and keeps reconciling', () => {
    const plan = planHandoverStep(
      state({
        intent: intent({
          cancelDispatchedAt: '2027-01-05T00:00:00Z',
          dispatchPeriodEndsAt: '2027-01-15T00:00:00Z',
        }),
        attempts: [{ id: 'spha_1', attemptNo: 1, outcome: 'unknown' }],
      }),
      { status: 'canceled', scheduledChange: null, currentBillingPeriod: null },
      [],
      now
    );
    expect(plan.nextState).toBe('done');
    expect(plan.observedCancel).toBe(true);
    expect(plan.closeReconciliation).toBe(false);
  });

  it('sends a cancel_scheduled intent with no live entry to staff with the end offer', () => {
    const revoked = entry({ revokedAt: d('2027-01-05T00:00:00Z') });
    const plan = planHandoverStep(
      state({
        intent: intent({ state: 'cancel_scheduled', paidUntil: '2027-01-15T00:00:00Z' }),
        linked: [revoked],
      }),
      active('2027-01-15T00:00:00Z', true),
      [],
      now
    );
    expect(plan.nextState).toBe('staff_review');
    expect(plan.endOffer).toBe(true);
    expect(plan.dispatch).toBeNull();
  });

  it('records charges from the boundary on and never before it', () => {
    const plan = planHandoverStep(
      state({ intent: intent({ state: 'cancel_scheduled', paidUntil: '2027-01-15T00:00:00Z' }) }),
      active('2027-01-15T00:00:00Z', true),
      [
        { id: 'txn_old', status: 'paid', billingPeriod: { startsAt: '2026-12-15T00:00:00Z' } },
        { id: 'txn_new', status: 'paid', billingPeriod: { startsAt: '2027-01-15T00:00:00Z' } },
      ],
      now
    );
    expect(plan.charges.map(charge => charge.id)).toEqual(['txn_new']);
  });

  it('backs off retries up to one day without a limit', () => {
    expect(retryDelayMs(0)).toBe(5 * 60_000);
    expect(retryDelayMs(3)).toBe(40 * 60_000);
    expect(retryDelayMs(40)).toBe(24 * 60 * 60_000);
  });
});
