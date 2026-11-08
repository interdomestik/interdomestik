import type { sponsorMailOutbox } from '@interdomestik/database';

import {
  type CoverageEntry,
  deriveEntryIntervals,
  effectiveEnd,
  entryEnd,
  isEligible,
} from '../sponsor-coverage/evaluate';
import { isLiveEntry } from '../sponsor-coverage/handover-boundary';

export type SponsorMailKind = typeof sponsorMailOutbox.$inferSelect.kind;
export type SponsorMailFacts = {
  entry: CoverageEntry | null;
  entries: readonly CoverageEntry[];
  userId: string | null;
  userExists: boolean;
  hasRecipient: boolean;
  entryExists: boolean;
  entryRevoked: boolean;
  termEffective: boolean;
  optedOut: boolean;
  intentAddressed: boolean;
  dispatchPeriodEndsAt: Date | null;
  hasCredential: boolean;
  nonSponsorCovered: boolean;
};
export type MailSkipReason =
  | 'recipient_missing'
  | 'entry_missing'
  | 'entry_unbound'
  | 'entry_ineligible'
  | 'interval_missing'
  | 'entry_ended'
  | 'before_start'
  | 'credential_exists'
  | 'dispatch_period_unknown'
  | 'handover_not_live'
  | 'entry_revoked'
  | 'successor_exists'
  | 'coverage_remains'
  | 'coverage_not_ended'
  | 'subscription_covers'
  | 'user_missing'
  | 'entry_opted_out'
  | 'term_ineffective';
export type SponsorMailCheck = { send: true } | { send: false; reason: MailSkipReason };
const skip = (reason: MailSkipReason): SponsorMailCheck => ({ send: false, reason });

/**
 * A successor continues coverage only when the coverage resolver gives it a non-empty interval
 * starting at its own `term_start`, contiguous with this entry's effective end (§3.6.2). Eligibility
 * (admitted, not revoked, not in staff review, effective term) comes from the same derivation.
 */
export function hasContinuingSuccessor(
  entry: CoverageEntry,
  entries: readonly CoverageEntry[]
): boolean {
  const intervals = deriveEntryIntervals(entries);
  return entries.some(
    next =>
      next.id !== entry.id &&
      next.sponsorId === entry.sponsorId &&
      next.termStart > entry.termStart &&
      next.termStart.getTime() === effectiveEnd(entry).getTime() &&
      intervals.get(next.id)?.start.getTime() === next.termStart.getTime()
  );
}

export function hasPresentOrFutureCoverage(entries: readonly CoverageEntry[], now: Date): boolean {
  return [...deriveEntryIntervals(entries).values()].some(interval => interval.end > now);
}

/** §3.8: all facts are fresh durable reads; cached handover state is deliberately absent. */
export function checkSponsorMail(
  kind: SponsorMailKind,
  facts: SponsorMailFacts,
  now: Date
): SponsorMailCheck {
  if (!facts.hasRecipient) return skip('recipient_missing');
  if (kind === 'membership_end_offer') {
    if (!facts.userExists) return skip('user_missing');
    if (hasPresentOrFutureCoverage(facts.entries, now)) return skip('coverage_remains');
    if (facts.nonSponsorCovered) return skip('subscription_covers');
    if (!facts.intentAddressed && (!facts.entry || entryEnd(facts.entry) > now)) {
      return skip('coverage_not_ended');
    }
    return { send: true };
  }
  if (!facts.entryExists) return skip('entry_missing');
  if (kind === 'opt_out_confirmation') return { send: true };
  if (kind === 'foreign_account' || kind === 'not_eligible') {
    if (facts.optedOut) return skip('entry_opted_out');
    return facts.termEffective ? { send: true } : skip('term_ineffective');
  }
  const entry = facts.entry;
  if (kind === 'renewal_notice') {
    if (facts.entryRevoked || entry?.revokedAt) return skip('entry_revoked');
    return entry && hasContinuingSuccessor(entry, facts.entries)
      ? skip('successor_exists')
      : { send: true };
  }
  if (!entry || !facts.userId || !facts.userExists) return skip('entry_unbound');
  if (kind === 'handover_pending') {
    if (!facts.dispatchPeriodEndsAt) return skip('dispatch_period_unknown');
    return isLiveEntry(entry, now, facts.dispatchPeriodEndsAt)
      ? { send: true }
      : skip('handover_not_live');
  }
  if (!isEligible(entry)) return skip('entry_ineligible');
  const interval = deriveEntryIntervals(facts.entries).get(entry.id);
  if (!interval || interval.start >= interval.end) return skip('interval_missing');
  if (now >= interval.end) return skip('entry_ended');
  if (kind !== 'handover_confirmed' && now < interval.start) return skip('before_start');
  if (kind === 'activation' && facts.hasCredential) return skip('credential_exists');
  return { send: true };
}
