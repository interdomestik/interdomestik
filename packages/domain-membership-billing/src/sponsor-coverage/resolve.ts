import {
  and,
  eq,
  inArray,
  sponsorHandoverIntents,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsorTermRevisions,
  sponsorTerms,
  subscriptions,
  user,
  type TenantTransaction,
} from '@interdomestik/database';

import { type CoverageEntry, type EffectiveMembership, evaluateCoverage } from './evaluate';

export type SubscriptionRow = typeof subscriptions.$inferSelect;
type EntryRow = typeof sponsorRosterEntries.$inferSelect;
type TermRow = typeof sponsorTerms.$inferSelect;

export type CoverageRow = {
  userId: string;
  subscription: SubscriptionRow | null;
  entry: EntryRow | null;
  term: TermRow | null;
  paidUntil: string | null;
  approvedDecisionId: string | null;
};

/** Postgres `timestamptz` text; an unreadable value fails closed. */
export function parseTimestamp(value: string): Date {
  const iso = value.replace(' ', 'T').replace(/([+-]\d{2})$/u, '$1:00');
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new Error('Unreadable sponsor timestamp');
  return parsed;
}

const optional = (value: string | null): Date | null => (value ? parseTimestamp(value) : null);

function toEntry(entry: EntryRow, term: TermRow, paidUntil: string | null): CoverageEntry {
  return {
    id: entry.id,
    sponsorId: term.sponsorId,
    termId: term.id,
    termStart: parseTimestamp(term.termStart),
    termEnd: parseTimestamp(term.termEnd),
    terminatedEffectiveAt: optional(term.terminatedEffectiveAt),
    termEffective: false,
    planId: term.planId,
    planKey: term.planKey,
    legalEntityId: term.legalEntityId,
    conflictDecision: entry.conflictDecision,
    revokedAt: optional(entry.revokedAt),
    outcome: entry.outcome,
    startsAt: optional(entry.startsAt),
    handoverPaidUntil: optional(paidUntil),
  };
}

/** Groups the joined rows per person; a term is effective when any revision was approved. */
export function groupCoverageRows(
  rows: readonly CoverageRow[]
): Map<string, { subscription: SubscriptionRow | null; entries: CoverageEntry[] }> {
  const people = new Map<
    string,
    { subscription: SubscriptionRow | null; entries: Map<string, CoverageEntry> }
  >();
  for (const row of rows) {
    const person = people.get(row.userId) ?? { subscription: null, entries: new Map() };
    person.subscription ??= row.subscription;
    people.set(row.userId, person);
    if (!row.entry || !row.term) continue;
    const entry = person.entries.get(row.entry.id) ?? toEntry(row.entry, row.term, row.paidUntil);
    if (row.approvedDecisionId) entry.termEffective = true;
    person.entries.set(entry.id, entry);
  }
  return new Map(
    [...people].map(([userId, person]) => [
      userId,
      { subscription: person.subscription, entries: [...person.entries.values()] },
    ])
  );
}

/**
 * ACQ-3b §3.6.1: one statement reads each person's subscription row and every roster entry bound
 * to them, with its term, approved-revision flag and handover `paid_until`. People outside the
 * tenant are absent from the result.
 */
export async function resolveEffectiveMembership(
  tx: TenantTransaction,
  tenantId: string,
  userIds: readonly string[],
  now: Date
): Promise<Map<string, EffectiveMembership<SubscriptionRow>>> {
  if (userIds.length === 0) return new Map();
  const rows: CoverageRow[] = await tx
    .select({
      userId: user.id,
      subscription: subscriptions,
      entry: sponsorRosterEntries,
      term: sponsorTerms,
      paidUntil: sponsorHandoverIntents.paidUntil,
      approvedDecisionId: sponsorRevisionDecisions.id,
    })
    .from(user)
    .leftJoin(
      subscriptions,
      and(eq(subscriptions.tenantId, user.tenantId), eq(subscriptions.userId, user.id))
    )
    .leftJoin(
      sponsorRosterEntries,
      and(
        eq(sponsorRosterEntries.tenantId, user.tenantId),
        eq(sponsorRosterEntries.userId, user.id)
      )
    )
    .leftJoin(
      sponsorTerms,
      and(
        eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorTerms.id, sponsorRosterEntries.termId)
      )
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
    .where(and(eq(user.tenantId, tenantId), inArray(user.id, [...userIds])));

  const people = groupCoverageRows(rows);
  return new Map([...people].map(([userId, inputs]) => [userId, evaluateCoverage(inputs, now)]));
}
