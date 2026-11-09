import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsors,
  sponsorTermRevisions,
  sponsorTerms,
  sql,
  type TenantTransaction,
  user,
} from '@interdomestik/database';
import { gt, isNotNull, lte } from 'drizzle-orm';

import { parseTimestamp } from '../sponsor-coverage/resolve';

const approvedDecision = () =>
  and(
    eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
    eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id),
    eq(sponsorRevisionDecisions.decision, 'approved')
  );

/** ACQ-3b §3.7: the durable facts one person job needs about its entry and term. */
export type ProvisioningEntryFacts = {
  tenantId: string;
  entryId: string;
  termId: string;
  userId: string | null;
  emailHmac: string | null;
  emailNormalized: string | null;
  firstName: string | null;
  lastName: string | null;
  conflictDecision: 'accepted' | 'rejected' | null;
  outcome: string;
  revoked: boolean;
  termStart: Date;
  /** `coalesce(terminated_effective_at, term_end)`. */
  effectiveEnd: Date;
  branchId: string;
  planId: string;
  planKey: string;
  /** Terms version of the effective (latest approved) revision. */
  termsVersion: string;
};

/** Returns null unless the entry exists and its term is effective (has an approved revision). */
export async function readProvisioningFacts(
  tx: TenantTransaction,
  tenantId: string,
  entryId: string
): Promise<ProvisioningEntryFacts | null> {
  const [row] = await tx
    .select({
      entry: sponsorRosterEntries,
      termStart: sponsorTerms.termStart,
      termEnd: sponsorTerms.termEnd,
      terminatedEffectiveAt: sponsorTerms.terminatedEffectiveAt,
      planId: sponsorTerms.planId,
      planKey: sponsorTerms.planKey,
      branchId: sponsors.branchId,
    })
    .from(sponsorRosterEntries)
    .innerJoin(
      sponsorTerms,
      and(
        eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorTerms.id, sponsorRosterEntries.termId)
      )
    )
    .innerJoin(
      sponsors,
      and(eq(sponsors.tenantId, sponsorTerms.tenantId), eq(sponsors.id, sponsorTerms.sponsorId))
    )
    .where(and(eq(sponsorRosterEntries.tenantId, tenantId), eq(sponsorRosterEntries.id, entryId)));
  if (!row) return null;
  const [effective] = await tx
    .select({ termsVersion: sponsorTermRevisions.termsVersion })
    .from(sponsorTermRevisions)
    .innerJoin(sponsorRevisionDecisions, approvedDecision())
    .where(
      and(
        eq(sponsorTermRevisions.tenantId, tenantId),
        eq(sponsorTermRevisions.termId, row.entry.termId)
      )
    )
    .orderBy(desc(sponsorTermRevisions.revision))
    .limit(1);
  if (!effective) return null;
  const { entry } = row;
  return {
    tenantId,
    entryId,
    termId: entry.termId,
    userId: entry.userId,
    emailHmac: entry.emailHmac,
    emailNormalized: entry.emailNormalized,
    firstName: entry.firstName,
    lastName: entry.lastName,
    conflictDecision: entry.conflictDecision,
    outcome: entry.outcome,
    revoked: entry.revokedAt !== null,
    termStart: parseTimestamp(row.termStart),
    effectiveEnd: parseTimestamp(row.terminatedEffectiveAt ?? row.termEnd),
    branchId: row.branchId,
    planId: row.planId,
    planKey: row.planKey,
    termsVersion: effective.termsVersion,
  };
}

/**
 * Due person jobs, in `(term_start, id)` order: pending, non-revoked, non-rejected entries of an
 * effective term that has not ended. Before `term_start` only undecided entries that can be bound
 * now (already bound, or whose address a tenant user carries) are due, so nothing waits in the
 * queue ahead of work that can progress.
 */
export async function listProvisioningWork(
  tx: TenantTransaction,
  tenantId: string,
  now: Date,
  limit: number
): Promise<string[]> {
  const at = now.toISOString();
  const effectiveTerms = tx
    .select({ termId: sponsorTermRevisions.termId })
    .from(sponsorTermRevisions)
    .innerJoin(sponsorRevisionDecisions, approvedDecision())
    .where(eq(sponsorTermRevisions.tenantId, tenantId));
  const tenantAddresses = tx
    .select({ email: sql<string>`lower(btrim(${user.email}))` })
    .from(user)
    .where(eq(user.tenantId, tenantId));
  const rows = await tx
    .select({ id: sponsorRosterEntries.id })
    .from(sponsorRosterEntries)
    .innerJoin(
      sponsorTerms,
      and(
        eq(sponsorTerms.tenantId, sponsorRosterEntries.tenantId),
        eq(sponsorTerms.id, sponsorRosterEntries.termId)
      )
    )
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        eq(sponsorRosterEntries.outcome, 'pending'),
        isNull(sponsorRosterEntries.revokedAt),
        or(
          isNull(sponsorRosterEntries.conflictDecision),
          eq(sponsorRosterEntries.conflictDecision, 'accepted')
        ),
        inArray(sponsorRosterEntries.termId, effectiveTerms),
        gt(sql`coalesce(${sponsorTerms.terminatedEffectiveAt}, ${sponsorTerms.termEnd})`, at),
        or(
          lte(sponsorTerms.termStart, at),
          and(
            isNull(sponsorRosterEntries.conflictDecision),
            or(
              isNotNull(sponsorRosterEntries.userId),
              inArray(sponsorRosterEntries.emailNormalized, tenantAddresses)
            )
          )
        )
      )
    )
    .orderBy(asc(sponsorTerms.termStart), asc(sponsorRosterEntries.id))
    .limit(limit);
  return rows.map(row => row.id);
}
