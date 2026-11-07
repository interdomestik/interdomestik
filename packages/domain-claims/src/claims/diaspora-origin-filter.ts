import {
  and,
  claimStageHistory,
  db,
  eq,
  inArray,
  or,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import type { SQL } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type DiasporaOriginFilter = 'all' | 'diaspora';

export const DIASPORA_ORIGIN_NOTE_PREFIX = 'Started from Diaspora / Green Card quickstart.';
export const DIASPORA_ORIGIN_COUNTRIES = ['DE', 'CH', 'AT', 'IT'] as const;
export const DIASPORA_ORIGIN_NOTES = DIASPORA_ORIGIN_COUNTRIES.flatMap(country => [
  `${DIASPORA_ORIGIN_NOTE_PREFIX} Country: ${country}. Incident location: abroad.`,
  `Member-submitted Diaspora/Green Card guidance: ${country}; not incident-country authority.`,
]);

export const parseDiasporaOriginFilter = (value: string | null | undefined): DiasporaOriginFilter =>
  value === 'diaspora' ? 'diaspora' : 'all';

export const matchesDiasporaOriginFilter = (
  filter: DiasporaOriginFilter,
  isDiasporaOrigin: boolean | null | undefined
): boolean => filter !== 'diaspora' || isDiasporaOrigin === true;

export const buildDiasporaOriginNoteCondition = (
  noteColumn: typeof claimStageHistory.note
): SQL<unknown> => or(...DIASPORA_ORIGIN_NOTES.map(note => eq(noteColumn, note)))!;

export function buildDiasporaOriginClaimIdsSubquery(tenantId: string) {
  // db-access-guard: tenant-scoped -- reason: query builder only; embedded as a subquery in a caller's tenant transaction and never executed on the ambient client
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

/**
 * The same subquery for a caller that already holds a tenant authority: it is built from that
 * caller's own tenant transaction, so it never touches the ambient client and the tenant is the
 * authority's.
 */
export function buildDiasporaOriginClaimIdsSubqueryIn(
  tx: TenantTransaction,
  authority: TenantAuthority
) {
  const { tenantId } = readTenantAuthority(authority);
  return tx
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
  authority: TenantAuthority;
  claimIds?: string[];
}): Promise<string[]> {
  const { authority, claimIds } = params;
  const { tenantId } = readTenantAuthority(authority);
  const conditions = [
    eq(claimStageHistory.tenantId, tenantId),
    buildDiasporaOriginNoteCondition(claimStageHistory.note),
  ];

  if (claimIds?.length) {
    conditions.push(inArray(claimStageHistory.claimId, claimIds));
  }

  // db-access-guard: tenant-scoped -- reason: validated tenant at boundary
  const rows = await withTenantAuthority(authority, tx =>
    tx
      .select({ claimId: claimStageHistory.claimId })
      .from(claimStageHistory)
      .where(and(...conditions))
  );

  return [...new Set(rows.map(row => row.claimId))];
}
