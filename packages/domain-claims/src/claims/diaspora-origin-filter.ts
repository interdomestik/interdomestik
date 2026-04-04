import { and, claimStageHistory, db, eq, ilike, inArray } from '@interdomestik/database';

export type DiasporaOriginFilter = 'all' | 'diaspora';

export const DIASPORA_ORIGIN_NOTE_PREFIX = 'Started from Diaspora / Green Card quickstart.';
export const DIASPORA_ORIGIN_NOTE_PATTERN = `${DIASPORA_ORIGIN_NOTE_PREFIX}%`;

export function parseDiasporaOriginFilter(value: string | null | undefined): DiasporaOriginFilter {
  return value === 'diaspora' ? 'diaspora' : 'all';
}

export function matchesDiasporaOriginFilter(
  filter: DiasporaOriginFilter,
  isDiasporaOrigin: boolean | null | undefined
): boolean {
  return filter !== 'diaspora' || isDiasporaOrigin === true;
}

export async function listDiasporaOriginClaimIds(params: {
  tenantId: string;
  claimIds?: string[];
}): Promise<string[]> {
  const { tenantId, claimIds } = params;
  const conditions = [
    eq(claimStageHistory.tenantId, tenantId),
    ilike(claimStageHistory.note, DIASPORA_ORIGIN_NOTE_PATTERN),
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
