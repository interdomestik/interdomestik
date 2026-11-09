/**
 * ACQ-3b §3.6.1: the pure coverage rules. Every boundary is a read-time fact of durable rows, so
 * no job has to run for coverage to start, renew, end or hand over.
 */

export type CoverageEntry = {
  id: string;
  sponsorId: string;
  termId: string;
  termStart: Date;
  termEnd: Date;
  terminatedEffectiveAt: Date | null;
  /** The term has an approved revision. */
  termEffective: boolean;
  planId: string;
  planKey: string;
  legalEntityId: string;
  conflictDecision: 'accepted' | 'rejected' | null;
  revokedAt: Date | null;
  outcome: string;
  startsAt: Date | null;
  /** `paid_until` of the entry's handover intent, when set. */
  handoverPaidUntil: Date | null;
};

export type CoverageSubscription = { provider: string | null };

export type CoverageInputs<S extends CoverageSubscription> = {
  subscription: S | null;
  entries: readonly CoverageEntry[];
};

export type EntryInterval = { start: Date; end: Date };

export type SponsorCoverage = {
  source: 'sponsor';
  entryId: string;
  termId: string;
  sponsorId: string;
  planId: string;
  planKey: string;
  legalEntityId: string;
  /** The allowance window `[start(E), end(E))` of the covering entry. */
  windowStart: Date;
  windowEnd: Date;
  /** The end of the contiguous chain that covers now. */
  coverageEnd: Date;
  lifecycle: { status: 'active'; cancelAtPeriodEnd: boolean; gracePeriodEndsAt: null };
};

export type EffectiveMembership<S extends CoverageSubscription> =
  SponsorCoverage | { source: 'subscription'; subscription: S } | { source: 'none' };

export const GROUP_SPONSOR_PROVIDER = 'group_sponsor';

const later = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);
const earlier = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

export function effectiveEnd(entry: CoverageEntry): Date {
  return entry.terminatedEffectiveAt ?? entry.termEnd;
}

/** Accepted at admission, not revoked and not in staff review. */
export function isEligible(entry: CoverageEntry): boolean {
  return (
    entry.termEffective &&
    entry.conflictDecision === 'accepted' &&
    entry.revokedAt === null &&
    entry.outcome !== 'staff_review'
  );
}

/** `end(E) = least(T.effective_end, coalesce(E.revoked_at, infinity))`. */
export function entryEnd(entry: CoverageEntry): Date {
  const end = effectiveEnd(entry);
  return entry.revokedAt ? earlier(end, entry.revokedAt) : end;
}

function byTermStart(a: CoverageEntry, b: CoverageEntry): number {
  return a.termStart.getTime() - b.termStart.getTime() || a.id.localeCompare(b.id);
}

/**
 * Derives the covering interval of every eligible entry of one person, in `term_start` order so a
 * renewal chain needs no materialization. Entries that do not cover, or whose interval is empty,
 * are absent from the result.
 */
export function deriveEntryIntervals(
  entries: readonly CoverageEntry[]
): ReadonlyMap<string, EntryInterval> {
  const intervals = new Map<string, EntryInterval>();
  for (const entry of [...entries].sort(byTermStart)) {
    if (!isEligible(entry)) continue;
    const rule = startRule(entry, entries, intervals);
    if (!rule) continue;
    const start = later(entry.termStart, rule);
    const end = entryEnd(entry);
    if (start.getTime() < end.getTime()) intervals.set(entry.id, { start, end });
  }
  return intervals;
}

function startRule(
  entry: CoverageEntry,
  entries: readonly CoverageEntry[],
  intervals: ReadonlyMap<string, EntryInterval>
): Date | null {
  if (entry.startsAt) return entry.startsAt;
  const continued = entries.some(previous => {
    if (previous.id === entry.id || previous.sponsorId !== entry.sponsorId) return false;
    if (effectiveEnd(previous).getTime() !== entry.termStart.getTime()) return false;
    const interval = intervals.get(previous.id);
    return interval?.end.getTime() === effectiveEnd(previous).getTime();
  });
  if (continued) return entry.termStart;
  return entry.handoverPaidUntil;
}

type Covering = { entry: CoverageEntry; interval: EntryInterval };

function covering(
  entries: readonly CoverageEntry[],
  intervals: ReadonlyMap<string, EntryInterval>,
  now: Date
): Covering | null {
  let best: Covering | null = null;
  for (const entry of entries) {
    const interval = intervals.get(entry.id);
    if (!interval || now < interval.start || now >= interval.end) continue;
    const order = best
      ? interval.start.getTime() - best.interval.start.getTime() ||
        entry.id.localeCompare(best.entry.id)
      : -1;
    if (order < 0) best = { entry, interval };
  }
  return best;
}

/** Interval ends strictly increase along the chain, so the walk terminates. */
function chainEnd(from: EntryInterval, intervals: ReadonlyMap<string, EntryInterval>): Date {
  const byStart = new Map(
    [...intervals.values()].map(interval => [interval.start.getTime(), interval])
  );
  let end = from.end;
  let next = byStart.get(end.getTime());
  while (next) {
    end = next.end;
    next = byStart.get(end.getTime());
  }
  return end;
}

/** Source 1 (a covering entry), else source 2 (a non-sponsor row), else none. */
export function evaluateCoverage<S extends CoverageSubscription>(
  inputs: CoverageInputs<S>,
  now: Date
): EffectiveMembership<S> {
  const intervals = deriveEntryIntervals(inputs.entries);
  const found = covering(inputs.entries, intervals, now);
  if (found) {
    const { entry, interval } = found;
    const coverageEnd = chainEnd(interval, intervals);
    return {
      source: 'sponsor',
      entryId: entry.id,
      termId: entry.termId,
      sponsorId: entry.sponsorId,
      planId: entry.planId,
      planKey: entry.planKey,
      legalEntityId: entry.legalEntityId,
      windowStart: interval.start,
      windowEnd: interval.end,
      coverageEnd,
      lifecycle: {
        status: 'active',
        cancelAtPeriodEnd: coverageEnd.getTime() === interval.end.getTime(),
        gracePeriodEndsAt: null,
      },
    };
  }
  const row = inputs.subscription;
  if (row && row.provider !== GROUP_SPONSOR_PROVIDER)
    return { source: 'subscription', subscription: row };
  return { source: 'none' };
}
