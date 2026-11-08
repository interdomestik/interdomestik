import { createHash } from 'node:crypto';
import { auditLog, sponsorHandoverIntents, type TenantTransaction } from '@interdomestik/database';
import { describe, expect, it, vi } from 'vitest';

import { applyHandoverPlan } from './handover-apply';
import type { HandoverState } from './handover-intent-read';
import type { HandoverPlan } from './handover-plan';

const now = new Date('2027-06-01T00:00:00Z');
const state: HandoverState = {
  intent: {
    id: 'intent',
    userId: 'member',
    providerSubscriptionId: 'subscription',
    state: 'cancel_scheduled',
    staffDisposition: null,
    cancelDispatchedAt: '2027-05-01T00:00:00Z',
    dispatchPeriodEndsAt: '2027-06-15T00:00:00Z',
    restorationCutoff: null,
    attempts: 6,
    paidUntil: '2027-06-15T00:00:00Z',
    paidUntilEvidence: 'paid',
    nextAttemptAt: null,
    canceledConfirmedAt: null,
    reconciliationClosedAt: null,
  },
  linked: [],
  attempts: [6, 2, 5, 3, 4].map(attemptNo => ({
    id: `attempt-${attemptNo}`,
    attemptNo,
    outcome: 'unknown',
  })),
};
const plan: HandoverPlan = {
  charges: [],
  observedCancel: false,
  scheduleConfirmed: true,
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
};

type Observation = typeof auditLog.$inferInsert;
function transaction() {
  const observations = new Map<string, Observation>();
  const conflict = vi.fn(async (row: Observation, options: unknown) => {
    expect(options).toEqual({ target: auditLog.id });
    if (!observations.has(row.id)) observations.set(row.id, row);
  });
  const insert = vi.fn((table: unknown) => {
    expect(table).toBe(auditLog);
    return {
      values: (row: Observation) => ({
        onConflictDoNothing: (options: unknown) => conflict(row, options),
      }),
    };
  });
  const update = vi.fn((table: unknown) => {
    expect(table).toBe(sponsorHandoverIntents);
    return { set: () => ({ where: vi.fn(async () => []) }) };
  });
  return { tx: { insert, update } as unknown as TenantTransaction, observations, conflict, insert };
}
const params = { tenantId: 'tenant', state, plan, now, hasCredential: async () => true };

describe('handover schedule recovery observations', () => {
  it('records one deterministic observation per newest attempt across daily repeats', async () => {
    const db = transaction();
    await expect(applyHandoverPlan(db.tx, params)).resolves.toBeNull();
    await applyHandoverPlan(db.tx, { ...params, now: new Date('2027-06-02T00:00:00Z') });
    const digest = createHash('sha256').update('tenant|intent|6').digest('hex');
    expect([...db.observations.values()]).toEqual([
      {
        id: `sph-confirmed:${digest}`,
        tenantId: 'tenant',
        actorId: null,
        actorRole: 'system',
        action: 'sponsor_intent.schedule_confirmed',
        entityType: 'sponsor_handover_intent',
        entityId: 'intent',
        metadata: { afterAttempt: 6 },
      },
    ]);
    expect(db.conflict).toHaveBeenCalledTimes(2);
    expect(state.attempts.every(attempt => attempt.outcome === 'unknown')).toBe(true);
  });

  it('gives a newer attempt, another intent and another tenant distinct identities', async () => {
    const db = transaction();
    await applyHandoverPlan(db.tx, params);
    await applyHandoverPlan(db.tx, {
      ...params,
      state: { ...state, attempts: [{ id: 'new', attemptNo: 7, outcome: 'unknown' }] },
    });
    await applyHandoverPlan(db.tx, { ...params, tenantId: 'other-tenant' });
    await applyHandoverPlan(db.tx, {
      ...params,
      state: { ...state, intent: { ...state.intent, id: 'other-intent' } },
    });
    expect(db.observations.size).toBe(4);
  });

  it('writes no observation without confirmation or without attempts', async () => {
    const db = transaction();
    await applyHandoverPlan(db.tx, { ...params, plan: { ...plan, scheduleConfirmed: false } });
    await applyHandoverPlan(db.tx, { ...params, state: { ...state, attempts: [] } });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('propagates a failed observation write', async () => {
    const db = transaction();
    db.conflict.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(applyHandoverPlan(db.tx, params)).rejects.toThrow('audit unavailable');
  });
});
