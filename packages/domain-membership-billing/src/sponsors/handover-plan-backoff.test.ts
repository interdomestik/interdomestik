import { describe, expect, it } from 'vitest';
import type { HandoverState } from './handover-intent-read';
import { planHandoverStep } from './handover-plan';
import type { HandoverSubscription } from './paddle-handover-client';

const now = new Date('2027-01-10T00:00:00Z');
const deadline = '2027-01-10T00:07:00Z';
const subscription: HandoverSubscription = {
  status: 'active',
  scheduledChange: null,
  nextBilledAt: '2027-01-15T00:00:00Z',
  currentBillingPeriod: { startsAt: '2026-12-15T00:00:00Z', endsAt: '2027-01-15T00:00:00Z' },
};
function state(nextAttemptAt: string | null = deadline): HandoverState {
  return {
    intent: {
      id: 'intent',
      userId: 'member',
      providerSubscriptionId: 'sub',
      state: 'pending',
      staffDisposition: null,
      cancelDispatchedAt: now.toISOString(),
      dispatchPeriodEndsAt: '2027-01-15T00:00:00Z',
      restorationCutoff: null,
      attempts: 1,
      paidUntil: null,
      paidUntilEvidence: null,
      canceledConfirmedAt: null,
      reconciliationClosedAt: null,
      nextAttemptAt,
    },
    linked: [
      {
        id: 'entry',
        sponsorId: 'sponsor',
        termId: 'term',
        termStart: new Date('2027-01-01'),
        termEnd: new Date('2028-01-01'),
        terminatedEffectiveAt: null,
        termEffective: true,
        planId: 'standard',
        planKey: 'plan',
        legalEntityId: 'ks',
        conflictDecision: 'accepted',
        revokedAt: null,
        outcome: 'awaiting_paid_end',
        startsAt: null,
        handoverPaidUntil: null,
      },
    ],
    attempts: [{ id: 'attempt', attemptNo: 1, outcome: 'unknown' }],
  };
}

describe('locked handover retry deadline', () => {
  it.each([deadline, '2027-01-10T00:20:00Z'])(
    'suppresses only dispatch and preserves deadline %s and reconciliation charges',
    nextAttemptAt => {
      const input = state(nextAttemptAt);
      input.intent.paidUntil = '2027-01-01T00:00:00Z';
      const charge = {
        id: 'charge',
        status: 'paid',
        billingPeriod: { startsAt: '2027-01-02T00:00:00Z' },
      };
      const due = planHandoverStep(
        { ...input, intent: { ...input.intent, nextAttemptAt: null } },
        subscription,
        [charge],
        now
      );
      expect(due.dispatch).not.toBeNull();
      const plan = planHandoverStep(input, subscription, [charge], now);
      expect(plan).toEqual({ ...due, dispatch: null, nextRunAt: new Date(nextAttemptAt) });
      expect(plan.charges).toEqual([charge]);
    }
  );

  it.each([null, '2027-01-09T00:00:00Z', now.toISOString()])(
    'dispatches at a due deadline %s',
    nextAttemptAt => {
      expect(planHandoverStep(state(nextAttemptAt), subscription, [], now).dispatch).not.toBeNull();
    }
  );

  it('records scheduled read-back evidence during backoff', () => {
    const plan = planHandoverStep(
      state(),
      { ...subscription, scheduledChange: { action: 'cancel' } },
      [{ id: 'paid', status: 'paid', billingPeriod: { startsAt: '2026-12-15T00:00:00Z' } }],
      now
    );
    expect(plan.evidence).toEqual({ paidUntil: '2027-01-15T00:00:00Z', transactionId: 'paid' });
    expect(plan.nextState).toBe('cancel_scheduled');
    expect(plan.startEntries).toHaveLength(1);
  });

  it('still observes cancellation and transitions to staff review during backoff', () => {
    const canceled = planHandoverStep(state(), { ...subscription, status: 'canceled' }, [], now);
    expect(canceled).toMatchObject({
      observedCancel: true,
      endOffer: true,
      nextState: 'staff_review',
    });
    const review = planHandoverStep(state(), { ...subscription, status: 'paused' }, [], now);
    expect(review.nextState).toBe('staff_review');
  });

  it('still records an unwanted scheduled cancellation during backoff', () => {
    const input = state();
    input.intent.state = 'closed_by_staff';
    const plan = planHandoverStep(
      input,
      {
        ...subscription,
        scheduledChange: { action: 'cancel', effectiveAt: '2027-01-15T00:00:00Z' },
      },
      [],
      now
    );
    expect(plan.scheduledCancelAt).toBe('2027-01-15T00:00:00.000Z');
  });
});

describe('scheduled recovery confirmation', () => {
  it.each([
    'pending',
    'cancel_scheduled',
    'staff_review',
    'closed_by_staff',
    'void',
    'done',
  ] as const)(
    'confirms a scheduled read-back only for cancel_scheduled, starting from %s',
    intentState => {
      const input = state();
      input.intent.state = intentState;
      input.intent.paidUntil = '2027-01-15T00:00:00Z';
      const plan = planHandoverStep(
        input,
        {
          ...subscription,
          scheduledChange: { action: 'cancel' },
        },
        [],
        now
      );
      expect(plan.scheduleConfirmed).toBe(intentState === 'cancel_scheduled');
      expect(plan.dispatch).toBeNull();
    }
  );
  it.each([
    { status: 'active', scheduledChange: null },
    { status: 'active', scheduledChange: { action: 'pause' } },
    { status: 'paused', scheduledChange: { action: 'cancel' } },
    { status: 'canceled', scheduledChange: { action: 'cancel' } },
  ])('does not confirm other read-backs: %j', readBack => {
    const input = state(null);
    input.intent.state = 'cancel_scheduled';
    input.intent.paidUntil = '2027-01-15T00:00:00Z';
    const plan = planHandoverStep(input, { ...subscription, ...readBack }, [], now);
    expect(plan.scheduleConfirmed).toBe(false);
  });
});
