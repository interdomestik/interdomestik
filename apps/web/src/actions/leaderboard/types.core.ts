import { z } from 'zod';

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

/** Zod schema for leaderboard period input */
export const leaderboardPeriodSchema = z.enum(['week', 'month', 'all']);

/** Max results for leaderboard queries to prevent expensive queries */
export const LEADERBOARD_MAX_RESULTS = 100;
