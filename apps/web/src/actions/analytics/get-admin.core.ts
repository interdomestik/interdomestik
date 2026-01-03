import { db } from '@interdomestik/database';
import { membershipPlans, subscriptions } from '@interdomestik/database/schema';
import { eq, gte, sql } from 'drizzle-orm';

import { isStaffOrAdmin } from '@/lib/roles.core';

import type { Session } from './context';
import type { AdminAnalyticsResult } from './types';

function hasAdminAnalyticsAccess(role: string | null | undefined): boolean {
  return isStaffOrAdmin(role);
}

export async function getAdminAnalyticsCore(params: {
  session: NonNullable<Session> | null;
}): Promise<AdminAnalyticsResult> {
  const { session } = params;

  try {
    if (!session?.user || !hasAdminAnalyticsAccess(session.user.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    const activeSubs = await db
      .select({
        subId: subscriptions.id,
        price: membershipPlans.price,
        interval: membershipPlans.interval,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .innerJoin(membershipPlans, eq(subscriptions.planId, membershipPlans.paddlePriceId))
      .where(eq(subscriptions.status, 'active'));

    let mrr = 0;
    for (const sub of activeSubs) {
      const price = parseFloat(sub.price || '0');
      if (sub.interval === 'year') {
        mrr += price / 12;
      } else {
        mrr += price;
      }
    }

    const allSubsCount = await db.select({ count: sql<number>`count(*)` }).from(subscriptions);

    const canceledSubsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'canceled'));

    const totalMembers = Number(allSubsCount[0]?.count || 0);
    const activeMembers = activeSubs.length;
    const canceledMembers = Number(canceledSubsCount[0]?.count || 0);
    const churnRate = totalMembers > 0 ? (canceledMembers / totalMembers) * 100 : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentGrowth = await db
      .select({
        date: sql<string>`DATE(${subscriptions.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .where(gte(subscriptions.createdAt, thirtyDaysAgo))
      .groupBy(sql`DATE(${subscriptions.createdAt})`)
      .orderBy(sql`DATE(${subscriptions.createdAt})`);

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
    return { success: false, error: 'Failed to fetch analytics' };
  }
}
