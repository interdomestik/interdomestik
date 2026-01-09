import { db } from '@interdomestik/database';
import { claims } from '@interdomestik/database/schema';
import { count, sql } from 'drizzle-orm';

export interface ForecastResult {
  trend: 'increasing' | 'stable' | 'decreasing';
  riskLevel: 'low' | 'medium' | 'high';
  deltaPercent: number;
}

export async function getClaimLoadForecast(): Promise<ForecastResult> {
  // Logic: Compare claims in last 14-30 days period vs last 0-14 days period (rolling windows)
  // We'll roughly say:
  // Current Period: Now to -14d
  // Previous Period: -14d to -28d

  const [currentPeriod] = await db
    .select({ count: count() })
    .from(claims)
    .where(sql`created_at >= NOW() - INTERVAL '14 days'`);

  const [previousPeriod] = await db
    .select({ count: count() })
    .from(claims)
    .where(
      sql`created_at < NOW() - INTERVAL '14 days' AND created_at >= NOW() - INTERVAL '28 days'`
    );

  const current = currentPeriod.count;
  const previous = previousPeriod.count;

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
