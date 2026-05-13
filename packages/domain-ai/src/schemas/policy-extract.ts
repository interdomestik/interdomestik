import { z } from 'zod';

const currencyCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/);

const optionalFactStringSchema = z.string().trim().min(1).nullable();

export const POLICY_EXTRACT_SCHEMA_VERSION = 'policy_extract_v1' as const;

export const policyExtractV1Schema = z
  .object({
    provider: optionalFactStringSchema,
    policyNumber: optionalFactStringSchema,
    coverageAmount: z.number().nonnegative(),
    currency: currencyCodeSchema,
    deductible: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().min(1)),
    hiddenPerks: z.array(z.string().trim().min(1)).optional(),
    summary: z.string().trim().min(1).optional(),
  })
  .strict();

export const policyExtractSchema = policyExtractV1Schema;

export type PolicyExtract = z.infer<typeof policyExtractSchema>;
