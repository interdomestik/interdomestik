import { claims, db } from '@interdomestik/database';
import { count, sql } from 'drizzle-orm';

export type PublicStats = {
  totalClaims: number;
  resolvedClaims: number;
  totalRecovered: number;
  successRate: number;
  avgResponseTime: number;
};

export async function getPublicStatsCore(): Promise<PublicStats> {
  const [totalClaimsResult] = await db.select({ count: count() }).from(claims);

  const [resolvedClaimsResult] = await db
    .select({ count: count() })
    .from(claims)
    .where(sql`${claims.status} = 'resolved'`);

  const [totalRecovered] = await db
    .select({ total: sql<string>`COALESCE(SUM(${claims.claimAmount}), 0)` })
    .from(claims)
    .where(sql`${claims.status} = 'resolved'`);

  const totalClaims = totalClaimsResult?.count || 0;
  const resolvedClaims = resolvedClaimsResult?.count || 0;
  const totalRecoveredNumber = Number(totalRecovered?.total || 0);

  return {
    totalClaims,
    resolvedClaims,
    totalRecovered: totalRecoveredNumber,
    successRate:
      resolvedClaims && totalClaims ? Math.round((resolvedClaims / totalClaims) * 100) : 0,
    avgResponseTime: 24,
  };
}
