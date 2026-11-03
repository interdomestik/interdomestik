import { type ClaimStatus } from '@interdomestik/database/constants';
import { claimStatusFromLifecycleFields } from '@interdomestik/database/claim-lifecycle';

import { claims, user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { claimLifecycleStatusIs } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export interface DashboardStats {
  totalClaims: number;
  newClaims: number;
  resolvedClaims: number;
  totalUsers: number;
  totalClaimVolume: number;
}

export async function getAdminDashboardStats(authority: TenantAuthority): Promise<DashboardStats> {
  const { tenantId } = readTenantAuthority(authority);
  const NEW_STATUS: ClaimStatus = 'submitted';
  const RESOLVED_STATUS: ClaimStatus = 'resolved';

  const [totalClaimsRes] = await withTenantAuthority(
    authority,
    async tx =>
      await tx.select({ count: count() }).from(claims).where(eq(claims.tenantId, tenantId))
  );

  const [newClaimsRes] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select({ count: count() })
        .from(claims)
        .where(and(claimLifecycleStatusIs(NEW_STATUS), eq(claims.tenantId, tenantId)))
  );

  const [resolvedClaimsRes] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select({ count: count() })
        .from(claims)
        .where(and(claimLifecycleStatusIs(RESOLVED_STATUS), eq(claims.tenantId, tenantId)))
  );

  const [totalUsersRes] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select({ count: count() })
        .from(user)
        .where(and(eq(user.role, 'user'), eq(user.tenantId, tenantId)))
  );

  const [volumeRes] = await withTenantAuthority(
    authority,
    async tx =>
      await tx
        .select({
          sum: sql<number>`COALESCE(SUM(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
        })
        .from(claims)
        .where(eq(claims.tenantId, tenantId))
  );

  return {
    totalClaims: totalClaimsRes.count,
    newClaims: newClaimsRes.count,
    resolvedClaims: resolvedClaimsRes.count,
    totalUsers: totalUsersRes.count,
    totalClaimVolume: Number(volumeRes.sum),
  };
}

export async function getRecentClaims(authority: TenantAuthority, limit = 5) {
  const { tenantId } = readTenantAuthority(authority);
  const recentClaims = await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.claims.findMany({
        where: (claims, { eq }) => eq(claims.tenantId, tenantId),
        with: {
          user: true,
        },
        limit,
        orderBy: [desc(claims.createdAt)],
      })
  );

  return recentClaims.map(claim => ({
    ...claim,
    status: claimStatusFromLifecycleFields(claim),
  }));
}

export async function getUnassignedClaims(authority: TenantAuthority, limit = 5) {
  const { tenantId } = readTenantAuthority(authority);
  return await withTenantAuthority(
    authority,
    async tx =>
      await tx.query.claims.findMany({
        with: {
          user: true,
        },
        where: (claims, { and, eq, isNull }) =>
          and(eq(claims.tenantId, tenantId), isNull(claims.staffId)),
        limit,
        orderBy: [desc(claims.createdAt)],
      })
  );
}
