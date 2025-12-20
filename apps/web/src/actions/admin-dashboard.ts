import { db } from '@interdomestik/database/db';
import { claims, user } from '@interdomestik/database/schema';
import { count, desc, eq, isNull, sql } from 'drizzle-orm';

export interface DashboardStats {
  totalClaims: number;
  newClaims: number;
  resolvedClaims: number;
  totalUsers: number;
  totalClaimVolume: number;
}

export async function getAdminDashboardStats(): Promise<DashboardStats> {
  const [totalClaimsRes] = await db.select({ count: count() }).from(claims);
  const [newClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'submitted'));
  const [resolvedClaimsRes] = await db
    .select({ count: count() })
    .from(claims)
    .where(eq(claims.status, 'resolved'));
  const [totalUsersRes] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.role, 'user'));

  const [volumeRes] = await db
    .select({
      sum: sql<number>`COALESCE(SUM(CAST(${claims.claimAmount} AS NUMERIC)), 0)`,
    })
    .from(claims);

  return {
    totalClaims: totalClaimsRes.count,
    newClaims: newClaimsRes.count,
    resolvedClaims: resolvedClaimsRes.count,
    totalUsers: totalUsersRes.count,
    totalClaimVolume: Number(volumeRes.sum),
  };
}

export async function getRecentClaims(limit = 5) {
  return await db.query.claims.findMany({
    with: {
      user: true,
    },
    limit,
    orderBy: [desc(claims.createdAt)],
  });
}

export async function getUnassignedClaims(limit = 5) {
  return await db.query.claims.findMany({
    with: {
      user: true,
    },
    where: isNull(claims.staffId),
    limit,
    orderBy: [desc(claims.createdAt)],
  });
}
