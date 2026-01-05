import { z } from 'zod';

export const activitySchema = z.object({
  memberId: z.string().min(1),
  type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
});

export type LogActivityInput = z.infer<typeof activitySchema>;

export const leadActivitySchema = z.object({
  leadId: z.string().min(1),
  type: z.enum(['call', 'email', 'meeting', 'note', 'other']),
  subject: z.string().min(1, 'Subject is required'),
  description: z.string().optional(),
});

export type LogLeadActivityInput = z.infer<typeof leadActivitySchema>;
