import { agentCommissions, db, user } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Session } from './context';
import type { ActionResult, LeaderboardData, LeaderboardEntry } from './types';

function hasLeaderboardAccess(role: string | null | undefined): boolean {
  return role === 'agent' || role === 'admin' || role === 'staff';
}

export async function getAgentLeaderboardCore(params: {
  session: NonNullable<Session> | null;
  period: 'week' | 'month' | 'all';
}): Promise<ActionResult<LeaderboardData>> {
  const { session, period } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!hasLeaderboardAccess(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

  try {
    const tenantId = ensureTenantId(session);

    let dateFilter = sql`TRUE`;
    const now = new Date();

    if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${agentCommissions.earnedAt} >= ${weekAgo.toISOString()}`;
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = sql`${agentCommissions.earnedAt} >= ${monthAgo.toISOString()}`;
    }

    const tenantFilter = eq(agentCommissions.tenantId, tenantId);

    const results = await db
      .select({
        agentId: agentCommissions.agentId,
        totalEarned: sql<string>`COALESCE(SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END), 0)`,
        dealCount: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
      .where(and(dateFilter, tenantFilter))
      .groupBy(agentCommissions.agentId)
      .orderBy(
        desc(
          sql`SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END)`
        )
      )
      .limit(10);

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

    let currentUserRank: number | null = null;
    const userInTop = topAgents.find(a => a.isCurrentUser);

    if (userInTop) {
      currentUserRank = userInTop.rank;
    } else if (session.user.role === 'agent') {
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
