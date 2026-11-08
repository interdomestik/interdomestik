import type { TenantTransaction } from '@interdomestik/database';

import { deriveEntryIntervals, evaluateCoverage, type SponsorCoverage } from './evaluate';
import { readCoverageEntries } from './resolve';

/**
 * ACQ-3b §3.6.3: what sponsorship means for a person now and next, for readers that must decide
 * on more than "covered now" (pricing, dunning). Source 1 only; a subscription row plays no part.
 */
export type SponsorOutlook = {
  /** The covering entry now, with its contiguous `coverageEnd`. */
  covering: SponsorCoverage | null;
  /** The earliest derived start after `now`, when an eligible entry starts later. */
  nextStart: Date | null;
};

const NO_SPONSORSHIP: SponsorOutlook = { covering: null, nextStart: null };

export async function readSponsorOutlook(
  tx: TenantTransaction,
  tenantId: string,
  userIds: readonly string[],
  now: Date
): Promise<Map<string, SponsorOutlook>> {
  const people = await readCoverageEntries(tx, tenantId, userIds);
  const outlooks = new Map<string, SponsorOutlook>();
  for (const userId of userIds) {
    const entries = people.get(userId) ?? [];
    if (entries.length === 0) {
      outlooks.set(userId, NO_SPONSORSHIP);
      continue;
    }
    const membership = evaluateCoverage({ subscription: null, entries }, now);
    const starts = [...deriveEntryIntervals(entries).values()]
      .map(interval => interval.start)
      .filter(start => start.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    outlooks.set(userId, {
      covering: membership.source === 'sponsor' ? membership : null,
      nextStart: starts[0] ?? null,
    });
  }
  return outlooks;
}
