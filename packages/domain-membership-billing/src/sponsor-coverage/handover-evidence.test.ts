import { describe, expect, it } from 'vitest';

import {
  attemptOutcomeFromResponse,
  classifyReadBack,
  type PaddleReadBack,
  providerSettlement,
} from './handover-evidence';

const period = { startsAt: '2027-03-01T00:00:00Z', endsAt: '2027-04-01T00:00:00Z' };
const scheduled: PaddleReadBack = {
  status: 'active',
  scheduledChange: { action: 'cancel' },
  currentBillingPeriod: period,
};
const paidTx = {
  id: 'txn_1',
  status: 'paid',
  billingPeriod: { startsAt: '2027-03-01T00:00:00.000Z' },
};

describe('classifyReadBack', () => {
  it('turns a scheduled cancel with the paid current period into evidence', () => {
    expect(classifyReadBack(scheduled, [paidTx])).toEqual({
      kind: 'evidence',
      paidUntil: period.endsAt,
      evidenceTransactionId: 'txn_1',
    });
  });

  it('never guesses paid_until without the period or its paid transaction', () => {
    expect(classifyReadBack({ ...scheduled, currentBillingPeriod: null }, [paidTx])).toEqual({
      kind: 'staff_review',
      reason: 'missing_period',
    });
    const otherPeriod = { ...paidTx, billingPeriod: { startsAt: '2027-02-01T00:00:00Z' } };
    const unpaid = { ...paidTx, status: 'billed' };
    expect(classifyReadBack(scheduled, [otherPeriod, unpaid])).toEqual({
      kind: 'staff_review',
      reason: 'missing_transaction',
    });
  });

  it('separates canceled, unscheduled and uncertain provider states', () => {
    expect(classifyReadBack({ ...scheduled, status: 'canceled' }, [])).toEqual({
      kind: 'canceled',
    });
    expect(classifyReadBack({ ...scheduled, scheduledChange: null }, [])).toEqual({
      kind: 'not_scheduled',
    });
    for (const status of ['trialing', 'past_due', 'paused']) {
      expect(classifyReadBack({ ...scheduled, status }, [paidTx]).kind).toBe('staff_review');
    }
    expect(classifyReadBack({ ...scheduled, scheduledChange: { action: 'pause' } }, [])).toEqual({
      kind: 'staff_review',
      reason: 'paddle_state',
    });
  });
});

describe('attempt outcomes and settlement', () => {
  it('resolves an attempt only from its own response', () => {
    expect(attemptOutcomeFromResponse({ kind: 'ok', subscription: scheduled })).toBe('scheduled');
    expect(
      attemptOutcomeFromResponse({
        kind: 'ok',
        subscription: { ...scheduled, scheduledChange: null },
      })
    ).toBe('unknown');
    expect(attemptOutcomeFromResponse({ kind: 'definite_error' })).toBe('refused');
    expect(attemptOutcomeFromResponse({ kind: 'indeterminate' })).toBe('unknown');
  });

  it('derives settlement from the attempts alone', () => {
    expect(providerSettlement([])).toBe('unsent');
    expect(providerSettlement([{ outcome: 'scheduled' }, { outcome: 'unknown' }])).toBe(
      'unresolved'
    );
    expect(providerSettlement([{ outcome: 'refused' }, { outcome: 'moot' }])).toBe('resolved');
  });
});
