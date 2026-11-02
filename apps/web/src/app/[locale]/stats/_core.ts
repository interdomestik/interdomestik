import { claims, withTenantContext } from '@interdomestik/database';
import { listTenantIdsForPlatformAggregate } from '@interdomestik/database/platform-directory';
import { claimLifecycleStatusIs } from '@interdomestik/domain-claims/claims/lifecycle-read-sql';
import { count, eq, sql } from 'drizzle-orm';

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
      let totalClaims = 0;
      let resolvedClaims = 0;
      let totalRecovered = 0;
      // Fixed public aggregate: no actor input, no per-tenant figure or tenant list leaves this
      // function. Each tenant's counts are read under its own RLS context and summed.
      for (const tenantId of await listTenantIdsForPlatformAggregate()) {
        const [statsRow] = await withTenantContext({ tenantId, role: 'system' }, tx =>
          tx
            .select({
              totalClaims: count(),
              resolvedClaims: sql<number>`
                COUNT(*) FILTER (WHERE ${claimLifecycleStatusIs('resolved')})
              `,
              totalRecovered: sql<string>`
                COALESCE(SUM(CASE WHEN ${claimLifecycleStatusIs('resolved')} THEN ${claims.claimAmount} ELSE 0 END), 0)
              `,
            })
            .from(claims)
            .where(eq(claims.tenantId, tenantId))
        );
        totalClaims += Number(statsRow?.totalClaims ?? 0);
        resolvedClaims += Number(statsRow?.resolvedClaims ?? 0);
        totalRecovered += Number(statsRow?.totalRecovered ?? 0);
      }

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
