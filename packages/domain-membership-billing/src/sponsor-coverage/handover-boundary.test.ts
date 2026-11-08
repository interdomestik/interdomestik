import { describe, expect, it } from 'vitest';

import type { CoverageEntry } from './evaluate';
import { checkDispatchBoundary, isLiveEntry } from './handover-boundary';

const month = (m: number) => new Date(Date.UTC(2027, m, 1));

function linked(id: string, start: number, end: number, extra: Partial<CoverageEntry> = {}) {
  return {
    id,
    sponsorId: 'sponsor-a',
    termId: `term-${id}`,
    termStart: month(start),
    termEnd: month(end),
    terminatedEffectiveAt: null,
    termEffective: true,
    planId: 'standard',
    planKey: 'plan-standard',
    legalEntityId: 'entity-ks',
    conflictDecision: 'accepted',
    revokedAt: null,
    outcome: 'awaiting_paid_end',
    startsAt: null,
    handoverPaidUntil: null,
    ...extra,
  } satisfies CoverageEntry;
}

describe('checkDispatchBoundary', () => {
  it('dispatches when a live entry itself covers B, recording it as the authorization', () => {
    expect(checkDispatchBoundary([linked('e1', 2, 14)], month(3), month(1), null)).toEqual({
      action: 'dispatch',
      authorization: {
        authorizingEntryId: 'e1',
        authorizingTermId: 'term-e1',
        authorizingTermStart: month(2),
        authorizingEnd: month(14),
        boundaryAt: month(3),
      },
    });
  });

  it('defers while every live entry still lies wholly after B', () => {
    expect(checkDispatchBoundary([linked('e1', 6, 18)], month(3), month(1), null)).toEqual({
      action: 'defer',
    });
  });

  it('refuses when every live entry ends by B, and when nothing is live', () => {
    const terminated = linked('e1', 0, 12, { terminatedEffectiveAt: month(3) });
    expect(checkDispatchBoundary([terminated], month(3), month(1), null)).toEqual({
      action: 'refuse',
    });
    const optedOut = linked('e2', 0, 12, { revokedAt: month(1), outcome: 'awaiting_paid_end' });
    expect(checkDispatchBoundary([optedOut], month(3), month(1), null)).toEqual({
      action: 'refuse',
    });
  });

  it('never lets a rejected, staff-review or expired entry authorize a cancel', () => {
    const entries = [
      linked('rejected', 0, 12, { conflictDecision: 'rejected' }),
      linked('review', 0, 12, { outcome: 'staff_review' }),
      linked('expired', 0, 2),
    ];
    expect(checkDispatchBoundary(entries, month(3), month(2), null).action).toBe('refuse');
  });
});

describe('isLiveEntry', () => {
  it('needs an end after max(term_start, paid_until)', () => {
    const entry = linked('e1', 0, 12);
    expect(isLiveEntry(entry, month(1), null)).toBe(true);
    expect(isLiveEntry(entry, month(1), month(12))).toBe(false);
    expect(isLiveEntry(entry, month(12), null)).toBe(false);
  });
});
