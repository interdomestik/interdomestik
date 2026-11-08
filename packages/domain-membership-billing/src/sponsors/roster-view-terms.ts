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

/** ACQ-3b §3.4 read model: the terms of the sponsors an actor may see. */
export type SponsorTermView = {
  termId: string;
  termStart: Date;
  termEnd: Date;
  terminatedEffectiveAt: Date | null;
  planKey: string;
  /** The term has an approved revision. */
  effective: boolean;
  /** Seat count of the latest approved revision. */
  seatCount: number | null;
};

const optional = (value: string | null): Date | null => (value ? parseTimestamp(value) : null);

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
  const approved =
    terms.length === 0
      ? []
      : await tx
          .select({
            termId: sponsorTermRevisions.termId,
            revision: sponsorTermRevisions.revision,
            seatCount: sponsorTermRevisions.seatCount,
          })
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
              inArray(
                sponsorTermRevisions.termId,
                terms.map(term => term.id)
              )
            )
          );
  const latest = new Map<string, { revision: number; seatCount: number }>();
  for (const row of approved) {
    const known = latest.get(row.termId);
    if (!known || row.revision > known.revision) latest.set(row.termId, row);
  }
  const bySponsor = new Map<string, SponsorTermView[]>();
  for (const term of terms) {
    const views = bySponsor.get(term.sponsorId) ?? [];
    views.push({
      termId: term.id,
      termStart: parseTimestamp(term.termStart),
      termEnd: parseTimestamp(term.termEnd),
      terminatedEffectiveAt: optional(term.terminatedEffectiveAt),
      planKey: term.planKey,
      effective: latest.has(term.id),
      seatCount: latest.get(term.id)?.seatCount ?? null,
    });
    bySponsor.set(term.sponsorId, views);
  }
  for (const views of bySponsor.values()) {
    views.sort((a, b) => b.termStart.getTime() - a.termStart.getTime());
  }
  return bySponsor;
}
