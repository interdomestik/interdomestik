import { listSuperAdminAggregateWork } from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import { eq, sql } from 'drizzle-orm';
import { assertPlatformAnalyticsActor, type PlatformAnalyticsActor } from '../v2/super-admin';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { forEachInOrder } from '../in-order';

export interface ForecastResult {
  trend: 'increasing' | 'stable' | 'decreasing';
  riskLevel: 'low' | 'medium' | 'high';
  deltaPercent: number;
}

export async function getClaimLoadForecast(actor: PlatformAnalyticsActor): Promise<ForecastResult> {
  assertPlatformAnalyticsActor(actor);
  // Logic: Compare claims in last 14-30 days period vs last 0-14 days period (rolling windows)
  // We'll roughly say:
  // Current Period: Now to -14d
  // Previous Period: -14d to -28d

  // Platform totals: each tenant's window counts are read under its own RLS context and summed.
  let current = 0;
  let previous = 0;
  await forEachInOrder(
    await listSuperAdminAggregateWork(actor),
    async ({ tenantId, authority }) => {
      const [row] = await withTenantAuthority(authority, tx =>
        tx
          .select({
            current: sql<number>`COUNT(*) FILTER (WHERE ${claims.createdAt} >= NOW() - INTERVAL '14 days')`,
            previous: sql<number>`COUNT(*) FILTER (WHERE ${claims.createdAt} < NOW() - INTERVAL '14 days' AND ${claims.createdAt} >= NOW() - INTERVAL '28 days')`,
          })
          .from(claims)
          .where(eq(claims.tenantId, tenantId))
      );
      current += Number(row?.current ?? 0);
      previous += Number(row?.previous ?? 0);
    }
  );

  // Prevent division by zero
  const safePrevious = previous === 0 ? 1 : previous;
  const deltaPercent = ((current - previous) / safePrevious) * 100;

  // Heuristics
  // Increase > 20% -> Increasing
  // Decrease < -20% -> Decreasing
  // Else -> Stable

  let trend: ForecastResult['trend'] = 'stable';
  if (deltaPercent > 20) trend = 'increasing';
  if (deltaPercent < -20) trend = 'decreasing';

  // Risk Level
  // If absolute count is high (>1000 in 2 weeks) AND increasing -> High
  // If count is high but stable -> Medium
  // If count is low -> Low

  let riskLevel: ForecastResult['riskLevel'] = 'low';
  if (current > 1000) {
    riskLevel = trend === 'increasing' ? 'high' : 'medium';
  } else if (current > 500 && trend === 'increasing') {
    riskLevel = 'medium';
  }

  return { trend, riskLevel, deltaPercent };
}
