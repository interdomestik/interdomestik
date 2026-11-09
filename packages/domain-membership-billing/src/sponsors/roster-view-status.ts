import { type CoverageEntry, deriveEntryIntervals, isEligible } from '../sponsor-coverage/evaluate';

/**
 * ACQ-3b §3.4: the status the company sees per roster entry. It is derived from the same coverage
 * rules as membership, never stored, and carries nothing about the member's account.
 */
export type CompanyVisibleStatus = 'registered' | 'awaiting_employee' | 'left_programme';

const LEFT_REASONS: ReadonlySet<string> = new Set(['opted_out', 'left']);

export type StatusFacts = {
  entryId: string;
  revokedReason: string | null;
  /** Every entry bound to the same person (all terms), or empty when the entry is unbound. */
  personEntries: readonly CoverageEntry[];
  hasCredential: boolean;
};

/**
 * `registered`: eligible, with a non-empty current or future interval, and a credential.
 * `left_programme`: opted out or left. Everything else, including foreign, not eligible, staff
 * review and a staff revocation, is `awaiting_employee`.
 */
export function companyVisibleStatus(facts: StatusFacts, now: Date): CompanyVisibleStatus {
  if (facts.revokedReason && LEFT_REASONS.has(facts.revokedReason)) return 'left_programme';
  const entry = facts.personEntries.find(candidate => candidate.id === facts.entryId);
  if (!entry || !isEligible(entry) || !facts.hasCredential) return 'awaiting_employee';
  const interval = deriveEntryIntervals(facts.personEntries).get(entry.id);
  return interval && interval.end.getTime() > now.getTime() ? 'registered' : 'awaiting_employee';
}

export type StatusCounts = Record<CompanyVisibleStatus, number>;

export function countStatuses(statuses: readonly CompanyVisibleStatus[]): StatusCounts {
  const counts: StatusCounts = { registered: 0, awaiting_employee: 0, left_programme: 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}
