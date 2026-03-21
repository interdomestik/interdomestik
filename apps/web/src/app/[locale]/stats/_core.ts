import { claims, db } from '@interdomestik/database';
import { count, sql } from 'drizzle-orm';

export type PublicStats = {
  totalClaims: number;
  resolvedClaims: number;
  totalRecovered: number;
  successRate: number;
  avgResponseTime: number;
};

const TRANSIENT_STATS_ERROR_CODES = new Set(['EADDRNOTAVAIL', 'ECONNRESET', 'ETIMEDOUT']);

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientStatsError(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } };
  return (
    TRANSIENT_STATS_ERROR_CODES.has(String(err?.code || '')) ||
    TRANSIENT_STATS_ERROR_CODES.has(String(err?.cause?.code || ''))
  );
}

export async function getPublicStatsCore(): Promise<PublicStats> {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [statsRow] = await db
        .select({
          totalClaims: count(),
          resolvedClaims: sql<number>`
            COUNT(*) FILTER (WHERE ${claims.status} = 'resolved')
          `,
          totalRecovered: sql<string>`
            COALESCE(SUM(CASE WHEN ${claims.status} = 'resolved' THEN ${claims.claimAmount} ELSE 0 END), 0)
          `,
        })
        .from(claims);

      const totalClaims = statsRow?.totalClaims || 0;
      const resolvedClaims = statsRow?.resolvedClaims || 0;
      const totalRecovered = Number(statsRow?.totalRecovered || 0);

      return {
        totalClaims,
        resolvedClaims,
        totalRecovered,
        successRate:
          resolvedClaims && totalClaims ? Math.round((resolvedClaims / totalClaims) * 100) : 0,
        avgResponseTime: 24,
      };
    } catch (error) {
      if (!isTransientStatsError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(attempt * 200);
    }
  }

  throw new Error('unreachable stats retry state');
}
