import { and, claims, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { claimLifecycleStatusSql } from '../claims/lifecycle-read-sql';
import { resolveClaimLifecycleReadProjection } from '../claims/lifecycle-read-model';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  authority: TenantAuthority;
  memberId: string;
  claimId: string;
}): Promise<MemberClaimDetail | null> {
  const { authority, memberId, claimId } = params;
  const { tenantId } = readTenantAuthority(authority);

  const [row] = await withTenantAuthority(authority, tx =>
    tx
      .select({
        id: claims.id,
        claimNumber: claims.claimNumber,
        status: claimLifecycleStatusSql(),
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
      .limit(1)
  );

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
