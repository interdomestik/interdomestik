import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  sponsorRevisionDecisions,
  sponsorRosterEntries,
  sponsorTermRevisions,
  sponsorTerms,
  sql,
  type TenantTransaction,
} from '@interdomestik/database';
import { lockSponsorPerson } from '@interdomestik/database/sponsor-locks';

import { parseTimestamp } from './resolve';

/**
 * ACQ-3b §3.6.1 admission: the write-once conflict decision. Nothing ever re-evaluates it, so
 * coverage that was granted is never displaced by a later binding, approval or purge.
 */
export type AdmissionEntry = {
  id: string;
  sponsorId: string;
  termStart: Date;
  termEnd: Date;
  terminatedEffectiveAt: Date | null;
  termEffective: boolean;
  conflictDecision: 'accepted' | 'rejected' | null;
  revokedAt: Date | null;
};

export type AdmissionDecision = { entryId: string; decision: 'accepted' | 'rejected' };

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

/** `[term_start, end(E'))` of an accepted entry, as stored. */
function occupancyEnd(entry: AdmissionEntry): Date {
  const end = entry.terminatedEffectiveAt ?? entry.termEnd;
  return entry.revokedAt && entry.revokedAt.getTime() < end.getTime() ? entry.revokedAt : end;
}

function isCandidate(entry: AdmissionEntry): boolean {
  return entry.termEffective && entry.revokedAt === null && entry.conflictDecision === null;
}

/**
 * Decides every undecided, non-revoked entry of an effective term of one bound person, in
 * `(term_start, id)` order. An entry is rejected when its term interval overlaps the occupancy of
 * another sponsor's accepted, unrevoked entry, including one accepted earlier in the same pass.
 */
export function decideAdmissions(entries: readonly AdmissionEntry[]): AdmissionDecision[] {
  const accepted = entries.filter(
    entry => entry.conflictDecision === 'accepted' && entry.revokedAt === null
  );
  const candidates = entries
    .filter(isCandidate)
    .sort((a, b) => a.termStart.getTime() - b.termStart.getTime() || a.id.localeCompare(b.id));
  const decisions: AdmissionDecision[] = [];
  for (const entry of candidates) {
    const conflict = accepted.some(
      other =>
        other.sponsorId !== entry.sponsorId &&
        overlaps(entry.termStart, entry.termEnd, other.termStart, occupancyEnd(other))
    );
    decisions.push({ entryId: entry.id, decision: conflict ? 'rejected' : 'accepted' });
    if (!conflict) accepted.push({ ...entry, conflictDecision: 'accepted' });
  }
  return decisions;
}

function writeDecision(
  tx: TenantTransaction,
  tenantId: string,
  entryIds: string[],
  decision: 'accepted' | 'rejected'
): Promise<unknown> {
  if (entryIds.length === 0) return Promise.resolve();
  return tx
    .update(sponsorRosterEntries)
    .set({ conflictDecision: decision, conflictDecidedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(sponsorRosterEntries.tenantId, tenantId),
        inArray(sponsorRosterEntries.id, entryIds),
        isNull(sponsorRosterEntries.conflictDecision)
      )
    );
}

const optional = (value: string | null): Date | null => (value ? parseTimestamp(value) : null);

/**
 * Admission under the person's lock (§3.5): lock 2, then the person's terms `FOR SHARE`, then the
 * person's entries `FOR UPDATE` in id order. Writes each decision once with `clock_timestamp()`.
 * The caller owns the tenant transaction; the guard trigger refuses any second write.
 *
 * Entries are locked only in the terms locked here; one uploaded meanwhile into another term is
 * admitted by its own job. `scope` (from identity binding, which already holds those terms) keeps
 * the term set: a term discovered after entry locks would be taken out of the §3.5 order, against a
 * termination that holds that term and waits for one of ours (Astra round 4).
 */
export async function admitPersonEntries(
  tx: TenantTransaction,
  tenantId: string,
  userId: string,
  scope?: { termIds: readonly string[] }
): Promise<AdmissionDecision[]> {
  await lockSponsorPerson(tx, userId);
  const personEntries = and(
    eq(sponsorRosterEntries.tenantId, tenantId),
    eq(sponsorRosterEntries.userId, userId)
  );
  const personTermIds = tx
    .select({ termId: sponsorRosterEntries.termId })
    .from(sponsorRosterEntries)
    .where(personEntries);
  const terms = await tx
    .select({
      id: sponsorTerms.id,
      sponsorId: sponsorTerms.sponsorId,
      termStart: sponsorTerms.termStart,
      termEnd: sponsorTerms.termEnd,
      terminatedEffectiveAt: sponsorTerms.terminatedEffectiveAt,
    })
    .from(sponsorTerms)
    .where(
      and(
        eq(sponsorTerms.tenantId, tenantId),
        inArray(sponsorTerms.id, personTermIds),
        scope ? inArray(sponsorTerms.id, [...scope.termIds]) : undefined
      )
    )
    .orderBy(asc(sponsorTerms.id))
    .for('share');
  if (terms.length === 0) return [];
  const entries = await tx
    .select({
      id: sponsorRosterEntries.id,
      termId: sponsorRosterEntries.termId,
      conflictDecision: sponsorRosterEntries.conflictDecision,
      revokedAt: sponsorRosterEntries.revokedAt,
    })
    .from(sponsorRosterEntries)
    .where(
      and(
        personEntries,
        inArray(
          sponsorRosterEntries.termId,
          terms.map(term => term.id)
        )
      )
    )
    .orderBy(asc(sponsorRosterEntries.id))
    .for('update');
  if (entries.length === 0) return [];

  const termIds = [...new Set(entries.map(entry => entry.termId))];
  const approved = await tx
    .selectDistinct({ termId: sponsorTermRevisions.termId })
    .from(sponsorTermRevisions)
    .innerJoin(
      sponsorRevisionDecisions,
      and(
        eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
        eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id),
        eq(sponsorRevisionDecisions.decision, 'approved')
      )
    )
    .where(
      and(
        eq(sponsorTermRevisions.tenantId, tenantId),
        inArray(sponsorTermRevisions.termId, termIds)
      )
    );
  const effective = new Set(approved.map(row => row.termId));
  const termById = new Map(terms.map(term => [term.id, term]));

  const decisions = decideAdmissions(
    entries.flatMap(entry => {
      const term = termById.get(entry.termId);
      if (!term) return [];
      return [
        {
          id: entry.id,
          sponsorId: term.sponsorId,
          termStart: parseTimestamp(term.termStart),
          termEnd: parseTimestamp(term.termEnd),
          terminatedEffectiveAt: optional(term.terminatedEffectiveAt),
          termEffective: effective.has(term.id),
          conflictDecision: entry.conflictDecision,
          revokedAt: optional(entry.revokedAt),
        },
      ];
    })
  );
  const idsFor = (decision: 'accepted' | 'rejected') =>
    decisions.filter(item => item.decision === decision).map(item => item.entryId);
  await writeDecision(tx, tenantId, idsFor('accepted'), 'accepted');
  await writeDecision(tx, tenantId, idsFor('rejected'), 'rejected');
  return decisions;
}
