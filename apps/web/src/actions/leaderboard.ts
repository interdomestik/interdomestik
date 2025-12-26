'use server';

import type { ActionResult, LeaderboardData } from './leaderboard/types';

export type { ActionResult, LeaderboardData, LeaderboardEntry } from './leaderboard/types';

import { getActionContext } from './leaderboard/context';
import { getAgentLeaderboardCore } from './leaderboard/get';

/**
 * Get agent leaderboard ranked by paid commissions.
 */
export async function getAgentLeaderboard(
  period: 'week' | 'month' | 'all' = 'month'
): Promise<ActionResult<LeaderboardData>> {
  const { session } = await getActionContext();
  return getAgentLeaderboardCore({ session, period });
}
