import { and, claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { getClaimStatus } from '../staff-claims/get-claim-status';
import { getClaimTimeline } from '../staff-claims/get-claim-timeline';

export type MemberClaimDetail = {
  id: string;
  claimNumber: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function normalizeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export async function getMemberClaimDetail(params: {
  tenantId: string;
  memberId: string;
  claimId: string;
}): Promise<MemberClaimDetail | null> {
  const { tenantId, memberId, claimId } = params;

  const [row] = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
      createdAt: claims.createdAt,
      updatedAt: claims.updatedAt,
    })
    .from(claims)
    .where(
      withTenant(
        tenantId,
        claims.tenantId,
        and(eq(claims.id, claimId), eq(claims.userId, memberId))
      )
    )
    .limit(1);

  if (!row) return null;
  const timeline = await getClaimTimeline({ tenantId, claimId });
  const status = timeline.length > 0 ? getClaimStatus(timeline).status : (row.status ?? null);

  return {
    id: row.id,
    claimNumber: row.claimNumber,
    status,
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
  };
}
