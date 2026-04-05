import { and, claimStageHistory, db, eq, inArray, or } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';

export type DiasporaOriginFilter = 'all' | 'diaspora';

export const DIASPORA_ORIGIN_NOTE_PREFIX = 'Started from Diaspora / Green Card quickstart.';
export const DIASPORA_ORIGIN_COUNTRIES = ['DE', 'CH', 'AT', 'IT'] as const;
export const DIASPORA_ORIGIN_NOTES = DIASPORA_ORIGIN_COUNTRIES.map(
  country => `${DIASPORA_ORIGIN_NOTE_PREFIX} Country: ${country}. Incident location: abroad.`
);

export function parseDiasporaOriginFilter(value: string | null | undefined): DiasporaOriginFilter {
  return value === 'diaspora' ? 'diaspora' : 'all';
}

export function matchesDiasporaOriginFilter(
  filter: DiasporaOriginFilter,
  isDiasporaOrigin: boolean | null | undefined
): boolean {
  return filter !== 'diaspora' || isDiasporaOrigin === true;
}

export function buildDiasporaOriginNoteCondition(
  noteColumn: typeof claimStageHistory.note
): SQL<unknown> {
  return or(...DIASPORA_ORIGIN_NOTES.map(note => eq(noteColumn, note)))!;
}

export function buildDiasporaOriginClaimIdsSubquery(tenantId: string) {
  return db
    .select({
      claimId: claimStageHistory.claimId,
    })
    .from(claimStageHistory)
    .where(
      and(
        eq(claimStageHistory.tenantId, tenantId),
        buildDiasporaOriginNoteCondition(claimStageHistory.note)
      )
    );
}

export async function listDiasporaOriginClaimIds(params: {
  tenantId: string;
  claimIds?: string[];
}): Promise<string[]> {
  const { tenantId, claimIds } = params;
  const conditions = [
    eq(claimStageHistory.tenantId, tenantId),
    buildDiasporaOriginNoteCondition(claimStageHistory.note),
  ];

  if (claimIds && claimIds.length > 0) {
    conditions.push(inArray(claimStageHistory.claimId, claimIds));
  }

  const rows = await db
    .select({
      claimId: claimStageHistory.claimId,
    })
    .from(claimStageHistory)
    .where(and(...conditions));

  return Array.from(new Set(rows.map(row => row.claimId)));
}
