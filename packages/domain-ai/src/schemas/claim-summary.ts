import { z } from 'zod';

export const CLAIM_SUMMARY_SCHEMA_VERSION = 'claim_summary_v1' as const;

export const claimSummaryV1Schema = z
  .object({
    summary: z.string().trim().min(1),
    keyPoints: z.array(z.string().trim().min(1)).min(1),
    recommendedActions: z.array(z.string().trim().min(1)),
    urgency: z.enum(['low', 'medium', 'high']),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export const claimSummarySchema = claimSummaryV1Schema;

export type ClaimSummary = z.infer<typeof claimSummarySchema>;
