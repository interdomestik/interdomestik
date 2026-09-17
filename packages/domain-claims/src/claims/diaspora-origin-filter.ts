import { and, claimStageHistory, db, eq, inArray, or } from '@interdomestik/database';
import type { SQL } from 'drizzle-orm';

export type DiasporaOriginFilter = 'all' | 'diaspora';

export const DIASPORA_ORIGIN_NOTE_PREFIX = 'Started from Diaspora / Green Card quickstart.';
export const DIASPORA_ORIGIN_COUNTRIES = ['DE', 'CH', 'AT', 'IT'] as const;
export const DIASPORA_ORIGIN_NOTES = DIASPORA_ORIGIN_COUNTRIES.flatMap(country => [
  `${DIASPORA_ORIGIN_NOTE_PREFIX} Country: ${country}. Incident location: abroad.`,
  `Member-submitted Diaspora/Green Card guidance: ${country}; not incident-country authority.`,
]);

export const parseDiasporaOriginFilter = (
  value: string | null | undefined
): DiasporaOriginFilter => (value === 'diaspora' ? 'diaspora' : 'all');

export const matchesDiasporaOriginFilter = (
  filter: DiasporaOriginFilter,
  isDiasporaOrigin: boolean | null | undefined
): boolean => filter !== 'diaspora' || isDiasporaOrigin === true;

export const buildDiasporaOriginNoteCondition = (
  noteColumn: typeof claimStageHistory.note
): SQL<unknown> => or(...DIASPORA_ORIGIN_NOTES.map(note => eq(noteColumn, note)))!;

export function buildDiasporaOriginClaimIdsSubquery(tenantId: string) {
  return db
    .select({ claimId: claimStageHistory.claimId })
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

  if (claimIds?.length) {
    conditions.push(inArray(claimStageHistory.claimId, claimIds));
  }

  // db-access-guard: tenant-scoped -- reason: validated tenant at boundary
  const rows = await db
    .select({ claimId: claimStageHistory.claimId })
    .from(claimStageHistory)
    .where(and(...conditions));

  return [...new Set(rows.map(row => row.claimId))];
}
