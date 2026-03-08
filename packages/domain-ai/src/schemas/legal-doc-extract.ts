import { z } from 'zod';

const dateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const LEGAL_DOC_EXTRACT_SCHEMA_VERSION = 'legal_doc_extract_v1' as const;

export const legalDocExtractV1Schema = z
  .object({
    documentType: z.enum([
      'court_filing',
      'demand_letter',
      'settlement_offer',
      'policy_notice',
      'regulatory_notice',
      'other',
    ]),
    issuer: z.string().trim().min(1),
    jurisdiction: z.string().trim().min(1),
    effectiveDate: dateSchema,
    summary: z.string().trim().min(1),
    obligations: z.array(z.string().trim().min(1)),
    confidence: z.number().min(0).max(1),
    warnings: z.array(z.string().trim().min(1)),
  })
  .strict();

export const legalDocExtractSchema = legalDocExtractV1Schema;

export type LegalDocExtract = z.infer<typeof legalDocExtractSchema>;
