import { and, claimStageHistory, desc, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export type ClaimTimelineEvent = {
  id: string;
  claimId: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
};

function toIso(value: Date | string | null | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }

  return date.toISOString();
}

export async function getClaimTimeline(params: {
  authority: TenantAuthority;
  claimId: string;
}): Promise<ClaimTimelineEvent[]> {
  const { authority, claimId } = params;
  const { tenantId } = readTenantAuthority(authority);

  const rows = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: claimStageHistory.id,
        claimId: claimStageHistory.claimId,
        fromStatus: claimStageHistory.fromStatus,
        toStatus: claimStageHistory.toStatus,
        createdAt: claimStageHistory.createdAt,
      })
      .from(claimStageHistory)
      .where(
        withTenant(
          tenantId,
          claimStageHistory.tenantId,
          and(eq(claimStageHistory.claimId, claimId))
        )
      )
      .orderBy(desc(claimStageHistory.createdAt), desc(claimStageHistory.id))
  );

  return rows.map(row => ({
    id: row.id,
    claimId: row.claimId,
    type: 'status_changed',
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    createdAt: toIso(row.createdAt),
  }));
}
