import {
  and,
  eq,
  inArray,
  sponsorRevisionDecisions,
  sponsorTermRevisions,
  sponsorTerms,
  type TenantTransaction,
} from '@interdomestik/database';

import { parseTimestamp } from '../sponsor-coverage/resolve';

/** ACQ-3b §3.4 read model: one revision of a term, with its decision when one was made. */
export type SponsorRevisionView = {
  revisionId: string;
  revision: number;
  seatCount: number;
  pricePerSeatMinor: number;
  currency: string;
  contractReference: string;
  termsVersion: string;
  /** Staff may decide a revision only when they did not create it (§3.4). */
  createdBy: string;
  decision: 'approved' | 'rejected' | null;
  decidedBy: string | null;
};

/** ACQ-3b §3.4 read model: the terms of the sponsors an actor may see. */
export type SponsorTermView = {
  termId: string;
  termStart: Date;
  termEnd: Date;
  terminatedEffectiveAt: Date | null;
  planKey: string;
  /** Staff may terminate a term only when they did not create it (§3.4). */
  createdBy: string;
  /** The term has an approved revision. */
  effective: boolean;
  /** Seat count of the latest approved revision. */
  seatCount: number | null;
  /** Every revision, newest first. */
  revisions: SponsorRevisionView[];
};

const optional = (value: string | null): Date | null => (value ? parseTimestamp(value) : null);

async function readRevisions(
  tx: TenantTransaction,
  tenantId: string,
  termIds: readonly string[]
): Promise<Map<string, SponsorRevisionView[]>> {
  if (termIds.length === 0) return new Map();
  const rows = await tx
    .select({
      termId: sponsorTermRevisions.termId,
      revisionId: sponsorTermRevisions.id,
      revision: sponsorTermRevisions.revision,
      seatCount: sponsorTermRevisions.seatCount,
      pricePerSeatMinor: sponsorTermRevisions.pricePerSeatMinor,
      currency: sponsorTermRevisions.currency,
      contractReference: sponsorTermRevisions.contractReference,
      termsVersion: sponsorTermRevisions.termsVersion,
      createdBy: sponsorTermRevisions.createdBy,
      decision: sponsorRevisionDecisions.decision,
      decidedBy: sponsorRevisionDecisions.decidedBy,
    })
    .from(sponsorTermRevisions)
    .leftJoin(
      sponsorRevisionDecisions,
      and(
        eq(sponsorRevisionDecisions.tenantId, sponsorTermRevisions.tenantId),
        eq(sponsorRevisionDecisions.revisionId, sponsorTermRevisions.id)
      )
    )
    .where(
      and(
        eq(sponsorTermRevisions.tenantId, tenantId),
        inArray(sponsorTermRevisions.termId, [...termIds])
      )
    );
  const byTerm = new Map<string, SponsorRevisionView[]>();
  for (const { termId, ...revision } of rows) {
    byTerm.set(termId, [...(byTerm.get(termId) ?? []), revision]);
  }
  for (const revisions of byTerm.values()) revisions.sort((a, b) => b.revision - a.revision);
  return byTerm;
}

export async function termViews(
  tx: TenantTransaction,
  tenantId: string,
  sponsorIds: readonly string[],
  termId?: string
): Promise<Map<string, SponsorTermView[]>> {
  if (sponsorIds.length === 0) return new Map();
  const terms = await tx
    .select()
    .from(sponsorTerms)
    .where(
      and(
        eq(sponsorTerms.tenantId, tenantId),
        inArray(sponsorTerms.sponsorId, [...sponsorIds]),
        termId ? eq(sponsorTerms.id, termId) : undefined
      )
    );
  const revisions = await readRevisions(
    tx,
    tenantId,
    terms.map(term => term.id)
  );
  const bySponsor = new Map<string, SponsorTermView[]>();
  for (const term of terms) {
    const termRevisions = revisions.get(term.id) ?? [];
    const approved = termRevisions.find(revision => revision.decision === 'approved');
    const views = bySponsor.get(term.sponsorId) ?? [];
    views.push({
      termId: term.id,
      termStart: parseTimestamp(term.termStart),
      termEnd: parseTimestamp(term.termEnd),
      terminatedEffectiveAt: optional(term.terminatedEffectiveAt),
      planKey: term.planKey,
      createdBy: term.createdBy,
      effective: approved !== undefined,
      seatCount: approved?.seatCount ?? null,
      revisions: termRevisions,
    });
    bySponsor.set(term.sponsorId, views);
  }
  for (const views of bySponsor.values()) {
    views.sort((a, b) => b.termStart.getTime() - a.termStart.getTime());
  }
  return bySponsor;
}
