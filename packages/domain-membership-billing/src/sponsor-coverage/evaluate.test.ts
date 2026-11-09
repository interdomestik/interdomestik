import { describe, expect, it } from 'vitest';

import { type CoverageEntry, deriveEntryIntervals, evaluateCoverage } from './evaluate';

const month = (m: number) => new Date(Date.UTC(2027, m, 1));

function entry(overrides: Partial<CoverageEntry> & Pick<CoverageEntry, 'id'>): CoverageEntry {
  return {
    sponsorId: 'sponsor-a',
    termId: `term-${overrides.id}`,
    termStart: month(0),
    termEnd: month(12),
    terminatedEffectiveAt: null,
    termEffective: true,
    planId: 'standard',
    planKey: 'plan-standard',
    legalEntityId: 'entity-ks',
    conflictDecision: 'accepted',
    revokedAt: null,
    outcome: 'seated',
    startsAt: null,
    handoverPaidUntil: null,
    ...overrides,
  };
}

const paddle = { provider: 'paddle', id: 'sub-1' };
const sponsorRow = { provider: 'group_sponsor', id: 'sub-2' };

describe('evaluateCoverage', () => {
  it('covers from the stored start, clamped to the term start, until the term end', () => {
    const early = entry({ id: 'e1', startsAt: new Date(Date.UTC(2026, 10, 1)) });
    const result = evaluateCoverage({ subscription: sponsorRow, entries: [early] }, month(3));
    expect(result).toMatchObject({
      source: 'sponsor',
      windowStart: month(0),
      windowEnd: month(12),
      coverageEnd: month(12),
      lifecycle: { status: 'active', cancelAtPeriodEnd: true, gracePeriodEndsAt: null },
    });
  });

  it('continues a same-sponsor renewal from its term start without a stored start', () => {
    const first = entry({ id: 'e1', startsAt: month(0) });
    const renewal = entry({ id: 'e2', termStart: month(12), termEnd: month(24) });
    const entries = [renewal, first];
    expect(evaluateCoverage({ subscription: null, entries }, month(5))).toMatchObject({
      entryId: 'e1',
      windowEnd: month(12),
      coverageEnd: month(24),
      lifecycle: { cancelAtPeriodEnd: false },
    });
    expect(evaluateCoverage({ subscription: null, entries }, month(13))).toMatchObject({
      entryId: 'e2',
      windowStart: month(12),
    });
  });

  it('does not continue across sponsors, a revoked predecessor or a terminated gap', () => {
    const other = entry({
      id: 'e2',
      sponsorId: 'sponsor-b',
      termStart: month(12),
      termEnd: month(24),
    });
    const revoked = entry({ id: 'e1', startsAt: month(0), revokedAt: month(6) });
    const gap = entry({ id: 'e3', startsAt: month(0), terminatedEffectiveAt: month(9) });
    const renewal = entry({ id: 'e4', termStart: month(12), termEnd: month(24) });
    expect(deriveEntryIntervals([entry({ id: 'e1', startsAt: month(0) }), other]).has('e2')).toBe(
      false
    );
    expect(deriveEntryIntervals([revoked, renewal]).has('e4')).toBe(false);
    expect(deriveEntryIntervals([gap, renewal]).has('e4')).toBe(false);
  });

  it('starts a handover entry at paid_until and never while it is in staff review', () => {
    const handover = entry({ id: 'e1', handoverPaidUntil: month(4) });
    const review = { ...handover, outcome: 'staff_review' };
    expect(evaluateCoverage({ subscription: paddle, entries: [handover] }, month(3))).toEqual({
      source: 'subscription',
      subscription: paddle,
    });
    expect(evaluateCoverage({ subscription: paddle, entries: [handover] }, month(4))).toMatchObject(
      { source: 'sponsor', windowStart: month(4) }
    );
    expect(evaluateCoverage({ subscription: paddle, entries: [review] }, month(5)).source).toBe(
      'subscription'
    );
  });

  it('never covers from a rejected, undecided or ineffective entry or a sponsor row alone', () => {
    const entries = [
      entry({ id: 'e1', startsAt: month(0), conflictDecision: 'rejected' }),
      entry({ id: 'e2', startsAt: month(0), conflictDecision: null }),
      entry({ id: 'e3', startsAt: month(0), termEffective: false }),
    ];
    expect(evaluateCoverage({ subscription: sponsorRow, entries }, month(2))).toEqual({
      source: 'none',
    });
  });

  it('ends at termination or revocation, whichever is first', () => {
    const terminated = entry({ id: 'e1', startsAt: month(0), terminatedEffectiveAt: month(8) });
    const revoked = entry({ id: 'e2', startsAt: month(0), revokedAt: month(5) });
    expect(deriveEntryIntervals([terminated]).get('e1')?.end).toEqual(month(8));
    expect(deriveEntryIntervals([revoked]).size).toBe(0);
    expect(evaluateCoverage({ subscription: null, entries: [terminated] }, month(8))).toEqual({
      source: 'none',
    });
  });

  it('keeps an accepted grant when a later overlapping entry was rejected at admission', () => {
    const b = entry({
      id: 'b',
      sponsorId: 'sponsor-b',
      termStart: month(6),
      termEnd: month(18),
      startsAt: month(6),
    });
    const a = entry({ id: 'a', startsAt: month(10), conflictDecision: 'rejected' });
    for (const now of [month(7), month(11), month(17)]) {
      expect(evaluateCoverage({ subscription: null, entries: [a, b] }, now)).toMatchObject({
        entryId: 'b',
        windowStart: month(6),
        windowEnd: month(18),
        planId: 'standard',
      });
    }
  });
});
