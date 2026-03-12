import { z } from 'zod';

export const FREE_START_CATEGORY_IDS = ['vehicle', 'property', 'injury'] as const;
export const FREE_START_OUTCOME_IDS = [
  'repair',
  'reimbursement',
  'compensation',
  'written_response',
] as const;

const VEHICLE_ISSUE_IDS = ['collision', 'theft', 'parking_damage', 'insurer_delay'] as const;
const PROPERTY_ISSUE_IDS = ['water_damage', 'storm_fire', 'burglary', 'landlord_dispute'] as const;
const INJURY_ISSUE_IDS = [
  'workplace_injury',
  'traffic_injury',
  'medical_negligence',
  'public_liability',
] as const;

type FreeStartCategoryId = (typeof FREE_START_CATEGORY_IDS)[number];

export const FREE_START_ISSUE_IDS = [
  ...VEHICLE_ISSUE_IDS,
  ...PROPERTY_ISSUE_IDS,
  ...INJURY_ISSUE_IDS,
] as const;

type FreeStartIssueId = (typeof FREE_START_ISSUE_IDS)[number];

const FREE_START_ISSUES_BY_CATEGORY = {
  injury: INJURY_ISSUE_IDS,
  property: PROPERTY_ISSUE_IDS,
  vehicle: VEHICLE_ISSUE_IDS,
} satisfies Record<FreeStartCategoryId, readonly FreeStartIssueId[]>;

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
