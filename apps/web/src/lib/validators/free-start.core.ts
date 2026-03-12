import {
  FREE_START_CATEGORY_IDS,
  FREE_START_ISSUE_IDS,
  FREE_START_ISSUES_BY_CATEGORY,
  FREE_START_OUTCOME_IDS,
  type FreeStartIssueId,
} from '@/lib/free-start-contract';

import { z } from 'zod';

export const freeStartCategorySchema = z.enum(FREE_START_CATEGORY_IDS);
export const freeStartOutcomeSchema = z.enum(FREE_START_OUTCOME_IDS);
export const freeStartIssueSchema = z.enum(FREE_START_ISSUE_IDS);

export const submitFreeStartIntakeSchema = z
  .object({
    category: freeStartCategorySchema,
    counterparty: z.string().trim().min(1, 'Counterparty is required.'),
    desiredOutcome: freeStartOutcomeSchema,
    incidentDate: z.string().trim().min(1, 'Incident date is required.'),
    issueType: freeStartIssueSchema,
    summary: z.string().trim().min(1, 'Summary is required.'),
  })
  .superRefine((value, ctx) => {
    const validIssues: readonly FreeStartIssueId[] = FREE_START_ISSUES_BY_CATEGORY[value.category];

    if (!validIssues.includes(value.issueType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Issue type must match the selected category.',
        path: ['issueType'],
      });
    }
  });

export type SubmitFreeStartIntakeInput = z.infer<typeof submitFreeStartIntakeSchema>;
