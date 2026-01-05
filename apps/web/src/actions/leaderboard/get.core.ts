import { agentCommissions, db, user } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Session } from './context';
import {
  LEADERBOARD_MAX_RESULTS,
  leaderboardPeriodSchema,
  type ActionResult,
  type LeaderboardData,
  type LeaderboardEntry,
} from './types';

function hasLeaderboardAccess(role: string | null | undefined): boolean {
  return role === 'agent' || role === 'admin' || role === 'staff';
}

export async function getAgentLeaderboardCore(params: {
  session: NonNullable<Session> | null;
  period: unknown; // Accept unknown and validate with Zod
}): Promise<ActionResult<LeaderboardData>> {
  const { session, period: rawPeriod } = params;

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!hasLeaderboardAccess(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

  // Validate period input
  const periodParsed = leaderboardPeriodSchema.safeParse(rawPeriod);
  if (!periodParsed.success) {
    return { success: false, error: 'Invalid period. Must be week, month, or all.' };
  }
  const period = periodParsed.data;

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
      // FIXED: Added tenantFilter to prevent cross-tenant data leak
      // FIXED: Added limit cap to prevent expensive queries
      const allRanked = await db
        .select({
          agentId: agentCommissions.agentId,
          total: sql<string>`COALESCE(SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END), 0)`,
        })
        .from(agentCommissions)
        .where(and(dateFilter, tenantFilter)) // SECURITY: Added tenantFilter
        .groupBy(agentCommissions.agentId)
        .orderBy(
          desc(
            sql`SUM(CASE WHEN ${agentCommissions.status} = 'paid' THEN ${agentCommissions.amount} ELSE 0 END)`
          )
        )
        .limit(LEADERBOARD_MAX_RESULTS); // SECURITY: Cap results

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
