export interface AnalyticsData {
  mrr: number;
  totalMembers: number;
  activeMembers: number;
  churnRate: number;
  recentSales: { date: string; amount: number }[];
  memberGrowth: { date: string; count: number }[];
}

export type AdminAnalyticsResult =
  | { success: true; data: AnalyticsData; error?: undefined }
  | { success: false; error: string; data?: undefined };
