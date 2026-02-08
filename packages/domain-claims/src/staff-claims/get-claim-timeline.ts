import { and, claimStageHistory, db, desc, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

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
  tenantId: string;
  claimId: string;
}): Promise<ClaimTimelineEvent[]> {
  const { tenantId, claimId } = params;

  const rows = await db
    .select({
      id: claimStageHistory.id,
      claimId: claimStageHistory.claimId,
      fromStatus: claimStageHistory.fromStatus,
      toStatus: claimStageHistory.toStatus,
      createdAt: claimStageHistory.createdAt,
    })
    .from(claimStageHistory)
    .where(
      withTenant(tenantId, claimStageHistory.tenantId, and(eq(claimStageHistory.claimId, claimId)))
    )
    .orderBy(desc(claimStageHistory.createdAt), desc(claimStageHistory.id));

  return rows.map(row => ({
    id: row.id,
    claimId: row.claimId,
    type: 'status_changed',
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    createdAt: toIso(row.createdAt),
  }));
}
