'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { membershipPlans, subscriptions } from '@interdomestik/database/schema';
import { eq, gte, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

export interface AnalyticsData {
  mrr: number;
  totalMembers: number;
  activeMembers: number;
  churnRate: number;
  recentSales: { date: string; amount: number }[];
  memberGrowth: { date: string; count: number }[];
}

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getAdminAnalytics(): Promise<{
  success: boolean;
  data?: AnalyticsData;
  error?: string;
}> {
  try {
    const session = await getSession();
    if (!session?.user || !['admin', 'staff'].includes(session.user.role)) {
      return { success: false, error: 'Unauthorized' };
    }

    // 1. Get Active Subscriptions with Plan Details
    // Note: We join on planId = paddlePriceId because webhook stores external ID
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

    // 2. Calculate MRR
    let mrr = 0;
    for (const sub of activeSubs) {
      const price = parseFloat(sub.price || '0');
      if (sub.interval === 'year') {
        mrr += price / 12;
      } else {
        mrr += price;
      }
    }

    // 3. Member Counts
    const allSubsCount = await db.select({ count: sql<number>`count(*)` }).from(subscriptions);

    const canceledSubsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'canceled'));

    const totalMembers = Number(allSubsCount[0]?.count || 0);
    const activeMembers = activeSubs.length;
    const canceledMembers = Number(canceledSubsCount[0]?.count || 0);
    const churnRate = totalMembers > 0 ? (canceledMembers / totalMembers) * 100 : 0;

    // 4. Growth Data (Last 30 days)
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
        recentSales: [], // Placeholder for now, requires transaction table
        memberGrowth: formattedGrowth,
      },
    };
  } catch (error) {
    console.error('Analytics error:', error);
    return { success: false, error: 'Failed to fetch analytics' };
  }
}
