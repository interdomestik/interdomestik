import { z } from 'zod';

export const verifyCashSchema = z.object({
  attemptId: z.string(),
  decision: z.enum(['approve', 'reject', 'needs_info']),
  note: z.string().optional(),
});

export const resubmitCashSchema = z.object({
  attemptId: z.string(),
  note: z.string().optional(),
});
