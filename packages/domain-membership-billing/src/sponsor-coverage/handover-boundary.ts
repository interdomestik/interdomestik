import { type CoverageEntry, entryEnd, isEligible } from './evaluate';

/**
 * ACQ-3b §3.7 step 1: the boundary check repeated before every cancel dispatch (the first cancel,
 * every retry and the attempt transaction). `B` is the paid end this cancel would produce.
 */
export function isLiveEntry(entry: CoverageEntry, now: Date, paidUntil: Date | null): boolean {
  const end = entryEnd(entry);
  const floor = paidUntil && paidUntil > entry.termStart ? paidUntil : entry.termStart;
  return isEligible(entry) && now < end && end > floor;
}

/** The FK-free authorization snapshot recorded on the attempt row. */
export type DispatchAuthorization = {
  authorizingEntryId: string;
  authorizingTermId: string;
  authorizingTermStart: Date;
  authorizingEnd: Date;
  boundaryAt: Date;
};

export type BoundaryDecision =
  | { action: 'dispatch'; authorization: DispatchAuthorization }
  /** Some live entry lies wholly after `B`: cancelling now would leave a gap. */
  | { action: 'defer' }
  /** Every live entry ends by `B` (or none is live): no cancel. */
  | { action: 'refuse' };

export function checkDispatchBoundary(
  linked: readonly CoverageEntry[],
  boundary: Date,
  now: Date,
  paidUntil: Date | null
): BoundaryDecision {
  const live = linked
    .filter(entry => isLiveEntry(entry, now, paidUntil))
    .sort((a, b) => a.termStart.getTime() - b.termStart.getTime() || a.id.localeCompare(b.id));
  const covering = live.find(entry => entry.termStart <= boundary && boundary < entryEnd(entry));
  if (covering) {
    return {
      action: 'dispatch',
      authorization: {
        authorizingEntryId: covering.id,
        authorizingTermId: covering.termId,
        authorizingTermStart: covering.termStart,
        authorizingEnd: entryEnd(covering),
        boundaryAt: boundary,
      },
    };
  }
  if (live.some(entry => boundary < entry.termStart)) return { action: 'defer' };
  return { action: 'refuse' };
}
