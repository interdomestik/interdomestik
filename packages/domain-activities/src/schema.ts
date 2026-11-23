import { z } from 'zod';

// Strict: an unknown key (an injected tenant, author or other identity) fails validation instead of
// being dropped, so a caller cannot believe it set a value the command ignores (R-05).

export const activitySchema = z
  .object({
    memberId: z.string().min(1),
    type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().optional(),
  })
  .strict();

export type LogActivityInput = z.infer<typeof activitySchema>;

export const leadActivitySchema = z
  .object({
    leadId: z.string().min(1),
    type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
    subject: z.string().min(1, 'Subject is required'),
    description: z.string().optional(),
  })
  .strict();

export type LogLeadActivityInput = z.infer<typeof leadActivitySchema>;
