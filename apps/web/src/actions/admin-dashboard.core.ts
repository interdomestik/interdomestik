import { type ClaimStatus } from '@interdomestik/database/constants';
import { db } from '@interdomestik/database/db';
import { claims, user } from '@interdomestik/database/schema';
import { and, count, desc, eq, sql } from 'drizzle-orm';

export interface DashboardStats {
  totalClaims: number;
  newClaims: number;
  resolvedClaims: number;
  totalUsers: number;
  totalClaimVolume: number;
}

export async function getAdminDashboardStats(tenantId: string): Promise<DashboardStats> {
  const NEW_STATUS: ClaimStatus = 'submitted';
  const RESOLVED_STATUS: ClaimStatus = 'resolved';

  const [totalClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.tenantId, tenantId));

  const [newClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.status, NEW_STATUS), eq(claims.tenantId, tenantId)));

  const [resolvedClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.status, RESOLVED_STATUS), eq(claims.tenantId, tenantId)));

  const [totalUsersRes] = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, 'user'), eq(user.tenantId, tenantId)));

  const [volumeRes] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
    })
    .from(claims)
    .where(eq(claims.tenantId, tenantId));

  return {
    totalClaims: totalClaimsRes.count,
    newClaims: newClaimsRes.count,
    resolvedClaims: resolvedClaimsRes.count,
    totalUsers: totalUsersRes.count,
    totalClaimVolume: Number(volumeRes.sum),
  };
}

export async function getRecentClaims(tenantId: string, limit = 5) {
  return await db.query.claims.findMany({
    where: (claims, { eq }) => eq(claims.tenantId, tenantId),
    with: {
      user: true,
    },
    limit,
    orderBy: [desc(claims.createdAt)],
  });
}

export async function getUnassignedClaims(tenantId: string, limit = 5) {
  return await db.query.claims.findMany({
    with: {
      user: true,
    },
    where: (claims, { and, eq, isNull }) =>
      and(eq(claims.tenantId, tenantId), isNull(claims.staffId)),
    limit,
    orderBy: [desc(claims.createdAt)],
  });
}
