'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import type { ClaimPackInput } from '@interdomestik/domain-claims/claim-pack';
import { generateClaimPack } from '@interdomestik/domain-claims/claim-pack';

import { enforceRateLimitForAction } from '@/lib/rate-limit';

export type GenerateClaimPackResult =
  | { success: true; data: ReturnType<typeof generateClaimPack> }
  | { success: false; error: string; code?: string; issues?: Record<string, string> };

const MAX_ESTIMATED_AMOUNT_CENTS = 1_000_000_000;
const shortTextSchema = z.string().trim().max(160).optional();
const incidentDateSchema = z
  .string()
  .trim()
  .min(1, 'Incident date is required')
  .max(32, 'Incident date is too long')
  .refine(value => Number.isFinite(new Date(value).getTime()), 'Incident date is invalid')
  .refine(
    value => new Date(value).getTime() <= Date.now(),
    'Incident date cannot be in the future'
  );

const commonAnswersSchema = z.object({
  incidentDate: incidentDateSchema,
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(1200, 'Description is too long'),
  estimatedAmount: z.number().int().nonnegative().max(MAX_ESTIMATED_AMOUNT_CENTS).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/u)
    .optional(),
  incidentCountry: z.string().trim().min(2).max(64).optional(),
});

const vehicleAnswersSchema = commonAnswersSchema.extend({
  counterpartyName: shortTextSchema,
  counterpartyInsurer: shortTextSchema,
  policeReportFiled: z.boolean().optional(),
  hasDamagePhotos: z.boolean().optional(),
  hasRepairEstimate: z.boolean().optional(),
});

const propertyAnswersSchema = commonAnswersSchema.extend({
  counterpartyName: shortTextSchema,
  damageType: shortTextSchema,
  hasOwnershipProof: z.boolean().optional(),
  hasDamagePhotos: z.boolean().optional(),
  hasInsurancePolicy: z.boolean().optional(),
});

const injuryAnswersSchema = commonAnswersSchema.extend({
  counterpartyName: shortTextSchema,
  hasMedicalRecords: z.boolean().optional(),
  hasIncidentReport: z.boolean().optional(),
  hasWitnessStatements: z.boolean().optional(),
  hasExpenseReceipts: z.boolean().optional(),
});

const generateClaimPackSchema = z.discriminatedUnion('claimType', [
  z.object({
    claimType: z.literal('vehicle'),
    answers: vehicleAnswersSchema,
    locale: z.string().trim().min(2).max(8).optional(),
    uploadedFileCount: z.number().int().nonnegative().max(25).optional(),
    generatedAt: z.string().datetime().optional(),
  }),
  z.object({
    claimType: z.literal('property'),
    answers: propertyAnswersSchema,
    locale: z.string().trim().min(2).max(8).optional(),
    uploadedFileCount: z.number().int().nonnegative().max(25).optional(),
    generatedAt: z.string().datetime().optional(),
  }),
  z.object({
    claimType: z.literal('injury'),
    answers: injuryAnswersSchema,
    locale: z.string().trim().min(2).max(8).optional(),
    uploadedFileCount: z.number().int().nonnegative().max(25).optional(),
    generatedAt: z.string().datetime().optional(),
  }),
]);

function formatFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([, value]) => Boolean(value?.[0]))
      .map(([key, value]) => [key, value?.[0] ?? 'Invalid input'])
  );
}

export async function generateClaimPackCore(params: {
  requestHeaders: Headers;
  input: ClaimPackInput;
}): Promise<GenerateClaimPackResult> {
  const limit = await enforceRateLimitForAction({
    name: 'action:generate-claim-pack',
    limit: 10,
    windowSeconds: 600,
    headers: params.requestHeaders,
    productionSensitive: true,
  });

  if (limit.limited) {
    return {
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    };
  }

  const parsed = generateClaimPackSchema.safeParse(params.input);

  if (!parsed.success) {
    return {
      success: false,
      error: 'Validation failed',
      code: 'INVALID_PAYLOAD',
      issues: formatFieldErrors(parsed.error.flatten().fieldErrors),
    };
  }

  try {
    const pack = generateClaimPack(parsed.data);
    return { success: true, data: pack };
  } catch (error) {
    console.error('[ClaimPack] Failed to generate claim pack:', error);
    return {
      success: false,
      error: 'Failed to generate your claim pack. Please try again.',
      code: 'GENERATION_FAILED',
    };
  }
}

export async function generateClaimPackAction(
  input: ClaimPackInput
): Promise<GenerateClaimPackResult> {
  return generateClaimPackCore({
    requestHeaders: await headers(),
    input,
  });
}
