import { describe, expect, it } from 'vitest';

import {
  chargesAfterBoundary,
  type ReconciliationIntent,
  reconciliationMayClose,
} from './handover-reconciliation';

const base: ReconciliationIntent = {
  state: 'done',
  staffDisposition: null,
  cancelDispatchedAt: '2027-02-10T00:00:00Z',
  paidUntil: '2027-04-01T00:00:00Z',
  dispatchPeriodEndsAt: '2027-04-01T00:00:00Z',
  restorationCutoff: null,
};
const tx = (id: string, status: string, startsAt: string) => ({
  id,
  status,
  billingPeriod: { startsAt },
});

describe('chargesAfterBoundary', () => {
  it('lists paid charges for periods starting at or after paid_until', () => {
    const found = chargesAfterBoundary(base, [
      tx('before', 'paid', '2027-03-01T00:00:00Z'),
      tx('at', 'completed', '2027-04-01T00:00:00Z'),
      tx('draft', 'draft', '2027-05-01T00:00:00Z'),
    ]);
    expect(found.map(item => item.id)).toEqual(['at']);
  });

  it('falls back to the dispatched period end before paid_until exists', () => {
    const intent = { ...base, paidUntil: null, dispatchPeriodEndsAt: '2027-03-01T00:00:00Z' };
    expect(chargesAfterBoundary(intent, [tx('t', 'paid', '2027-03-01T00:00:00Z')])).toHaveLength(1);
  });
});

describe('reconciliationMayClose', () => {
  const scan = { settlement: 'resolved' as const, fullScanAfterState: true };

  it('closes a canceled intent only after a full scan with no non-final transaction', () => {
    expect(reconciliationMayClose({ ...scan, intent: base, transactions: [] })).toBe(true);
    expect(
      reconciliationMayClose({
        ...scan,
        intent: base,
        transactions: [tx('t', 'billed', '2027-04-01T00:00:00Z')],
      })
    ).toBe(false);
    expect(
      reconciliationMayClose({ ...scan, fullScanAfterState: false, intent: base, transactions: [] })
    ).toBe(false);
  });

  it('keeps renewing_as_member open while any attempt is unknown', () => {
    const intent: ReconciliationIntent = {
      ...base,
      state: 'closed_by_staff',
      staffDisposition: 'renewing_as_member',
      restorationCutoff: '2027-05-01T00:00:00Z',
    };
    expect(reconciliationMayClose({ ...scan, intent, transactions: [] })).toBe(true);
    expect(
      reconciliationMayClose({ ...scan, settlement: 'unresolved', intent, transactions: [] })
    ).toBe(false);
    const open = [tx('t', 'past_due', '2027-04-01T00:00:00Z')];
    expect(reconciliationMayClose({ ...scan, intent, transactions: open })).toBe(false);
    const later = [tx('own', 'billed', '2027-06-01T00:00:00Z')];
    expect(reconciliationMayClose({ ...scan, intent, transactions: later })).toBe(true);
  });

  it('closes void only without a dispatch record and never closes an active intent', () => {
    const voidIntent = { ...base, state: 'void' as const, cancelDispatchedAt: null };
    expect(reconciliationMayClose({ ...scan, intent: voidIntent, transactions: [] })).toBe(true);
    for (const state of ['pending', 'cancel_scheduled', 'staff_review'] as const) {
      expect(
        reconciliationMayClose({ ...scan, intent: { ...base, state }, transactions: [] })
      ).toBe(false);
    }
  });
});
