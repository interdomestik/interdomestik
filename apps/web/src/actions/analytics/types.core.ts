import { z } from 'zod';

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

/** Zod schema for analytics query parameters */
export const analyticsQuerySchema = z
  .object({
    /** Number of days to look back for growth data (default: 30, max: 90) */
    daysBack: z.number().int().min(1).max(90).optional().default(30),
    /** Limit for growth data points (default: 90, max: 365) */
    limit: z.number().int().min(1).max(365).optional().default(90),
  })
  .strict();

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
