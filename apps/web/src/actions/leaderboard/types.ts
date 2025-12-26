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
