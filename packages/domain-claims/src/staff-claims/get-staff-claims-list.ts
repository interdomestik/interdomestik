import { claims, db, desc, eq, inArray, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ACTIONABLE_CLAIM_STATUSES } from '../claims/constants';

export type StaffClaimsListItem = {
  id: string;
  claimNumber: string | null;
  status: string | null;
  stageLabel: string;
  updatedAt: string | null;
  memberName?: string;
  memberNumber?: string | null;
};

function formatStageLabel(status: string | null | undefined) {
  if (!status) return 'Draft';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getStaffClaimsList(params: {
  staffId: string;
  tenantId: string;
  limit: number;
  cursor?: string | null;
}): Promise<StaffClaimsListItem[]> {
  const { tenantId, limit } = params;

  const rows = await db
    .select({
      id: claims.id,
      claimNumber: claims.claimNumber,
      status: claims.status,
      updatedAt: claims.updatedAt,
      memberName: user.name,
      memberNumber: user.memberNumber,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(withTenant(tenantId, claims.tenantId, inArray(claims.status, ACTIONABLE_CLAIM_STATUSES)))
    .orderBy(desc(claims.updatedAt))
    .limit(limit);

  return rows.map(row => ({
    id: row.id,
    claimNumber: row.claimNumber,
    status: row.status,
    stageLabel: formatStageLabel(row.status),
    updatedAt: normalizeDate(row.updatedAt),
    memberName: row.memberName ?? undefined,
    memberNumber: row.memberNumber ?? null,
  }));
}
