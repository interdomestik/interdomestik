import { z } from 'zod';

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);
const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);

export const CLAIM_INTAKE_EXTRACT_SCHEMA_VERSION = 'claim_intake_extract_v1' as const;

export const claimIntakeExtractV1Schema = z
  .object({
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    category: z.enum(['travel', 'medical', 'property', 'liability', 'other']),
    incidentDate: dateSchema,
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/),
    estimatedAmount: z.number().nonnegative(),
    currency: currencyCodeSchema,
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export const claimIntakeExtractSchema = claimIntakeExtractV1Schema;

export type ClaimIntakeExtract = z.infer<typeof claimIntakeExtractSchema>;
