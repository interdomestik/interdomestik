import { db } from '@interdomestik/database';
import { membershipPlans, subscriptions } from '@interdomestik/database/schema';
import { and, eq, gte, sql } from 'drizzle-orm';

import { isStaffOrAdmin } from '@/lib/roles.core';

import type { Session } from './context';
import type { AdminAnalyticsResult, AnalyticsQueryInput } from './types';
import { analyticsQuerySchema } from './types';

function hasAdminAnalyticsAccess(role: string | null | undefined): boolean {
  return isStaffOrAdmin(role);
}

export async function getAdminAnalyticsCore(params: {
  session: NonNullable<Session> | null;
  query?: Partial<AnalyticsQueryInput>;
}): Promise<AdminAnalyticsResult> {
  const { session, query } = params;

  try {
    if (!session?.user || !hasAdminAnalyticsAccess(session.user.role)) {
      return { success: false, error: 'Unauthorized', data: undefined };
    }

    // SECURITY: Validate tenant context
    const tenantId = session.user.tenantId;
    if (!tenantId) {
      return { success: false, error: 'Missing tenant context', data: undefined };
    }

    // SECURITY: Validate query parameters
    const parsed = analyticsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid query: ${parsed.error.issues[0]?.message}`,
        data: undefined,
      };
    }
    const { daysBack, limit } = parsed.data;

    const activeSubs = await db
      .select({
        subId: subscriptions.id,
        price: membershipPlans.price,
        interval: membershipPlans.interval,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(subscriptions.planId, membershipPlans.paddlePriceId))
      .where(and(eq(subscriptions.status, 'active'), eq(subscriptions.tenantId, tenantId)));

    let mrr = 0;
    for (const sub of activeSubs) {
      const price = Number.parseFloat(sub.price || '0');
      if (sub.interval === 'year') {
        mrr += price / 12;
      } else {
        mrr += price;
      }
    }

    const allSubsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));

    const canceledSubsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'canceled'), eq(subscriptions.tenantId, tenantId)));

    const totalMembers = Number(allSubsCount[0]?.count || 0);
    const activeMembers = activeSubs.length;
    const canceledMembers = Number(canceledSubsCount[0]?.count || 0);
    const churnRate = totalMembers > 0 ? (canceledMembers / totalMembers) * 100 : 0;

    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - daysBack);

    const recentGrowth = await db
      .select({
        date: sql<string>`DATE(${subscriptions.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .where(and(gte(subscriptions.createdAt, lookbackDate), eq(subscriptions.tenantId, tenantId)))
      .groupBy(sql`DATE(${subscriptions.createdAt})`)
      .orderBy(sql`DATE(${subscriptions.createdAt})`)
      .limit(limit);

    const formattedGrowth = recentGrowth.map(item => ({
      date: String(item.date),
      count: Number(item.count),
    }));

    return {
      success: true,
      data: {
        mrr,
        totalMembers,
        activeMembers,
        churnRate,
        recentSales: [],
        memberGrowth: formattedGrowth,
      },
      error: undefined,
    };
  } catch (error) {
    console.error('Analytics error:', error);
    return { success: false, error: 'Failed to fetch analytics', data: undefined };
  }
}
