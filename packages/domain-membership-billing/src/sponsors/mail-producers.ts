import {
  and,
  eq,
  sponsorHandoverIntents,
  sponsorMailOutbox,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsorTermRevisions,
  sponsorTerms,
  subscriptions,
  type TenantTransaction,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { nanoid } from 'nanoid';

import { type CoverageEntry, entryEnd, isEligible } from '../sponsor-coverage/evaluate';
import { groupCoverageRows, type SubscriptionRow } from '../sponsor-coverage/resolve';
import {
  getMembershipLifecycleBucket,
  membershipLifecycleGrantsAccess,
} from '../subscription/lifecycle-reporting';
import { hasContinuingSuccessor, hasPresentOrFutureCoverage } from './mail-checks';

type Person = { subscription: SubscriptionRow | null; entries: readonly CoverageEntry[] };
type DailyKind = 'renewal_notice' | 'membership_end_offer';
export type DailyMail = { rosterEntryId: string; kind: DailyKind; idempotencyKey: string };

export function nonSponsorGrantsAccess(subscription: SubscriptionRow | null, now: Date): boolean {
  return (
    subscription !== null &&
    subscription.provider !== 'group_sponsor' &&
    membershipLifecycleGrantsAccess(getMembershipLifecycleBucket({ subscription, now }))
  );
}

export function planRenewalNotices(entries: readonly CoverageEntry[], now: Date): DailyMail[] {
  const horizon = new Date(now.getTime() + 30 * 86_400_000);
  return entries
    .filter(
      entry =>
        isEligible(entry) &&
        entryEnd(entry) > now &&
        entryEnd(entry) <= horizon &&
        !hasContinuingSuccessor(entry, entries)
    )
    .map(entry => ({
      rosterEntryId: entry.id,
      kind: 'renewal_notice',
      idempotencyKey: `sponsor-entry:${entry.id}:renewal_notice:30d`,
    }));
}

/**
 * Offers are produced only within this window after the end. Outbox rows are deleted three
 * months after they finish (§3.9), so an unbounded scan would queue the same offer again.
 */
const END_OFFER_WINDOW_MS = 30 * 86_400_000;

/** One latest-ending entry per person's sponsor; earlier terms cannot produce duplicate offers. */
export function planEndOffers(person: Person, now: Date): DailyMail[] {
  const since = new Date(now.getTime() - END_OFFER_WINDOW_MS);
  if (
    hasPresentOrFutureCoverage(person.entries, now) ||
    nonSponsorGrantsAccess(person.subscription, now)
  )
    return [];
  const latest = new Map<string, CoverageEntry>();
  for (const entry of person.entries) {
    if (!entry.termEffective || entry.conflictDecision !== 'accepted' || entryEnd(entry) > now) {
      continue;
    }
    const previous = latest.get(entry.sponsorId);
    const order = previous
      ? entryEnd(entry).getTime() - entryEnd(previous).getTime() ||
        entry.id.localeCompare(previous.id)
      : 1;
    if (order > 0) latest.set(entry.sponsorId, entry);
  }
  return [...latest.values()]
    .filter(entry => entryEnd(entry) > since)
    .map(entry => ({
      rosterEntryId: entry.id,
      kind: 'membership_end_offer',
      idempotencyKey: `sponsor-entry:${entry.id}:membership_end_offer`,
    }));
}

async function readPeople(tx: TenantTransaction, tenantId: string): Promise<Map<string, Person>> {
  const rows = await tx
    .select({
      userId: user.id,
      subscription: subscriptions,
      entry: sponsorRosterEntries,
      term: sponsorTerms,
      paidUntil: sponsorHandoverIntents.paidUntil,
      approvedDecisionId: sponsorRevisionDecisions.id,
    })
    .from(sponsorRosterEntries)
    .innerJoin(
      user,
      and(
        eq(user.tenantId, sponsorRosterEntries.tenantId),
        eq(user.id, sponsorRosterEntries.userId)
      )
    )
    .innerJoin(
      sponsorTerms,
      and(
        eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorTerms.id, sponsorRosterEntries.termId)
      )
    )
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.tenantId, user.tenantId), eq(subscriptions.userId, user.id))
    )
    .leftJoin(
      sponsorHandoverIntents,
      and(
        eq(sponsorHandoverIntents.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorHandoverIntents.id, sponsorRosterEntries.handoverIntentId)
      )
    )
    .leftJoin(
      sponsorTermRevisions,
      and(
        eq(sponsorTermRevisions.tenantId, sponsorTerms.tenantId),
        eq(sponsorTermRevisions.termId, sponsorTerms.id)
      )
    )
    .leftJoin(
      sponsorRevisionDecisions,
      and(
        eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
        eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id),
        eq(sponsorRevisionDecisions.decision, 'approved')
      )
    )
    .where(eq(sponsorRosterEntries.tenantId, tenantId));
  return groupCoverageRows(rows);
}

async function queueDailyMail(
  tx: TenantTransaction,
  tenantId: string,
  now: Date,
  kind: DailyKind
): Promise<number> {
  const people = await readPeople(tx, tenantId);
  const mails = [...people.values()].flatMap(person =>
    kind === 'renewal_notice' ? planRenewalNotices(person.entries, now) : planEndOffers(person, now)
  );
  if (mails.length === 0) return 0;
  const inserted = await tx
    .insert(sponsorMailOutbox)
    .values(
      mails.map(mail => ({
        ...mail,
        id: nanoid(),
        tenantId,
        nextAttemptAt: now.toISOString(),
      }))
    )
    .onConflictDoNothing({ target: sponsorMailOutbox.idempotencyKey })
    .returning({ id: sponsorMailOutbox.id });
  return inserted.length;
}

export async function queueRenewalNotices(authority: TenantAuthority, now: Date): Promise<number> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx => queueDailyMail(tx, tenantId, now, 'renewal_notice'));
}

export async function queueEndOffers(authority: TenantAuthority, now: Date): Promise<number> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    queueDailyMail(tx, tenantId, now, 'membership_end_offer')
  );
}
