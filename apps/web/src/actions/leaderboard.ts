'use server';

import { auth } from '@/lib/auth';
import { agentCommissions, db, user } from '@interdomestik/database';
import { desc, eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  agentImage: string | null;
  totalEarned: number;
  dealCount: number;
  isCurrentUser: boolean;
}

export interface LeaderboardData {
  topAgents: LeaderboardEntry[];
  currentUserRank: number | null;
  period: 'week' | 'month' | 'all';
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Get agent leaderboard ranked by paid commissions.
 */
export async function getAgentLeaderboard(
  period: 'week' | 'month' | 'all' = 'month'
): Promise<ActionResult<LeaderboardData>> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Only agents and admins can view leaderboard
  if (!['agent', 'admin', 'staff'].includes(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

  try {
    // Calculate date filter based on period
    let dateFilter = sql`TRUE`;
    const now = new Date();

    if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${agentCommissions.earnedAt} >= ${weekAgo.toISOString()}`;
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${agentCommissions.earnedAt} >= ${monthAgo.toISOString()}`;
    }

    // Get aggregated commission data per agent
    const results = await db
      .select({
        agentId: agentCommissions.agentId,
        totalEarned: sql<string>`COALESCE(SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END), 0)`,
        dealCount: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
      .where(dateFilter)
      .groupBy(agentCommissions.agentId)
      .orderBy(
        desc(
          sql`SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END)`
        )
      )
      .limit(10);

    // Fetch agent details
    const topAgents: LeaderboardEntry[] = await Promise.all(
      results.map(async (row, index) => {
        const agentData = await db.query.user.findFirst({
          where: eq(user.id, row.agentId),
          columns: { name: true, image: true },
        });

        return {
          rank: index + 1,
          agentId: row.agentId,
          agentName: agentData?.name || 'Unknown Agent',
          agentImage: agentData?.image || null,
          totalEarned: Number(row.totalEarned),
          dealCount: row.dealCount,
          isCurrentUser: row.agentId === session.user.id,
        };
      })
    );

    // Find current user's rank if not in top 10
    let currentUserRank: number | null = null;
    const userInTop = topAgents.find(a => a.isCurrentUser);

    if (userInTop) {
      currentUserRank = userInTop.rank;
    } else if (session.user.role === 'agent') {
      // Query user's position
      const allRanked = await db
        .select({
          agentId: agentCommissions.agentId,
          total: sql<string>`COALESCE(SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END), 0)`,
        })
        .from(agentCommissions)
        .where(dateFilter)
        .groupBy(agentCommissions.agentId)
        .orderBy(
          desc(
            sql`SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END)`
          )
        );

      const userIndex = allRanked.findIndex(r => r.agentId === session.user.id);
      currentUserRank = userIndex >= 0 ? userIndex + 1 : null;
    }

    return {
      success: true,
      data: {
        topAgents,
        currentUserRank,
        period,
      },
    };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return { success: false, error: 'Failed to fetch leaderboard' };
  }
}
