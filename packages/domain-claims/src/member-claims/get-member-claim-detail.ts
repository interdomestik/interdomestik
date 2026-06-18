import { and, claims, db, eq } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { resolveClaimLifecycleReadProjection } from '../claims/lifecycle-read-model';

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
      caseLifecycleState: claims.caseLifecycleState,
      recoveryLifecycleState: claims.recoveryLifecycleState,
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
  const { status } = resolveClaimLifecycleReadProjection(row);

  return {
    id: row.id,
    claimNumber: row.claimNumber,
    status,
    createdAt: normalizeDate(row.createdAt),
    updatedAt: normalizeDate(row.updatedAt),
  };
}
