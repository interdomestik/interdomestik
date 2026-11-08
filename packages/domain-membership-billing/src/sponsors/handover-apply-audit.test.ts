import { sponsorHandoverIntents } from '@interdomestik/database';
import { describe, expect, it } from 'vitest';

import { SPONSOR_SYSTEM_ACTOR } from './audit';
import { auditTransaction, expectAudits } from './audit-test-support';
import { applyHandoverPlan, resolveAttempt } from './handover-apply';
import type { HandoverState } from './handover-intent-read';
import type { HandoverPlan } from './handover-plan';

const now = new Date('2027-01-01');
function state(): HandoverState {
  return {
    intent: {
      id: 'intent',
      userId: 'member',
      providerSubscriptionId: 'subscription',
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
    },
    linked: [],
    attempts: [],
  };
}
function plan(overrides: Partial<HandoverPlan> = {}): HandoverPlan {
  return {
    charges: [],
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
    nextRunAt: now,
    ...overrides,
  };
}
const params = {
  tenantId: 'tenant',
  state: state(),
  now,
  hasCredential: async (): Promise<boolean> => true,
};

describe('handover plan state audit', () => {
  it.each(['cancel_scheduled', 'staff_review', 'void', 'done'] as const)(
    'records a change to %s after updating the intent',
    async nextState => {
      const db = auditTransaction();
      await applyHandoverPlan(db.tx, { ...params, plan: plan({ nextState }) });
      expect(db.writes[0]?.table).toBe(sponsorHandoverIntents);
      expectAudits(db, [
        {
          action: 'sponsor_intent.state',
          entityType: 'sponsor_handover_intent',
          entityId: 'intent',
          ...SPONSOR_SYSTEM_ACTOR,
          metadata: { previousState: 'pending', state: nextState },
        },
      ]);
    }
  );
  it('includes published paid-until evidence, followed by the seated-entry event', async () => {
    const db = auditTransaction();
    await applyHandoverPlan(db.tx, {
      ...params,
      plan: plan({
        nextState: 'cancel_scheduled',
        evidence: { paidUntil: now.toISOString(), transactionId: 'txn-evidence' },
        startEntries: [{ entryId: 'entry', interval: { start: now, end: new Date('2028-01-01') } }],
      }),
    });
    expectAudits(db, [
      {
        action: 'sponsor_intent.state',
        entityType: 'sponsor_handover_intent',
        entityId: 'intent',
        ...SPONSOR_SYSTEM_ACTOR,
        metadata: {
          previousState: 'pending',
          state: 'cancel_scheduled',
          evidenceId: 'txn-evidence',
        },
      },
      {
        action: 'sponsor_entry.started',
        entityType: 'sponsor_roster_entry',
        entityId: 'entry',
        ...SPONSOR_SYSTEM_ACTOR,
        metadata: { at: now.toISOString() },
      },
    ]);
  });
  it.each([null, 'pending'] as const)(
    'does not audit unchanged state %s or invent revocations',
    async nextState => {
      const db = auditTransaction();
      await applyHandoverPlan(db.tx, {
        ...params,
        plan: plan({ nextState, emptyIntervalEntries: ['empty'], reopenEntries: ['reopened'] }),
      });
      expectAudits(db, []);
    }
  );
  it('propagates audit failure before producing entry starts', async () => {
    const db = auditTransaction({ failAudit: true });
    await expect(
      applyHandoverPlan(db.tx, { ...params, plan: plan({ nextState: 'staff_review' }) })
    ).rejects.toThrow('audit unavailable');
  });
});

describe('attempt refusal state audit', () => {
  const input = {
    tenantId: 'tenant',
    intentId: 'intent',
    attemptId: 'attempt',
    outcome: 'refused' as const,
    evidenceRef: 'attempt-response',
    now,
  };
  it.each(['pending', 'cancel_scheduled'])(
    'records %s to staff review, without confusing attempt and paid-until evidence',
    async previousState => {
      const db = auditTransaction({ selects: [[{ state: previousState }]] });
      await resolveAttempt(db.tx, input);
      expect(db.writes[1]?.table).toBe(sponsorHandoverIntents);
      expectAudits(db, [
        {
          action: 'sponsor_intent.state',
          entityType: 'sponsor_handover_intent',
          entityId: 'intent',
          ...SPONSOR_SYSTEM_ACTOR,
          metadata: { previousState, state: 'staff_review' },
        },
      ]);
    }
  );
  it.each(['staff_review', 'closed_by_staff', 'void', 'done'])(
    'does not audit refusal in %s',
    async currentState => {
      const db = auditTransaction({ selects: [[{ state: currentState }]] });
      await resolveAttempt(db.tx, input);
      expectAudits(db, []);
    }
  );
  it.each(['unknown', 'scheduled', 'moot'] as const)(
    'does not audit a state change for outcome %s',
    async outcome => {
      const db = auditTransaction({ selects: [[{ state: 'pending' }]] });
      await resolveAttempt(db.tx, { ...input, outcome });
      expectAudits(db, []);
    }
  );
});
