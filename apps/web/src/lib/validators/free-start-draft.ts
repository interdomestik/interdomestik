import { z } from 'zod';

const MEDICAL_TOKENS = new Set([
  'injury',
  'injured',
  'doctor',
  'hospital',
  'pain',
  'blood',
  'medical',
  'diagnosis',
  'treatment',
  'lëndim',
  'lënduar',
  'mjek',
  'mjeku',
  'spital',
  'dhimbje',
  'gjak',
  'mjekësor',
  'diagnozë',
  'trajtim',
  'povreda',
  'povređen',
  'povređena',
  'lekar',
  'doktor',
  'bolnica',
  'bol',
  'krv',
  'medicinski',
  'dijagnoza',
  'lečenje',
  'повреда',
  'повреден',
  'повредена',
  'лекар',
  'доктор',
  'болница',
  'болка',
  'крв',
  'медицински',
  'дијагноза',
  'лекување',
]);

const ISSUE_MATRIX = {
  vehicle: new Set(['collision', 'theft', 'parking_damage', 'insurer_delay']),
  property: new Set(['water_damage', 'storm_fire', 'burglary', 'landlord_dispute']),
} as const;

export function normalizeFreeStartDraftText(value: string): string | null {
  const normalized = value.normalize('NFKC').replace(/\r\n?/g, '\n').trim();
  return normalized || null;
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function containsMedicalToken(value: string | null): boolean {
  if (!value) return false;
  const tokens =
    value
      .normalize('NFKC')
      .toLowerCase()
      .match(/\p{L}+/gu) ?? [];
  return tokens.some(token => MEDICAL_TOKENS.has(token));
}

function normalizedText(maxCharacters: number) {
  return z
    .string()
    .transform(normalizeFreeStartDraftText)
    .refine(value => value === null || Array.from(value).length <= maxCharacters, {
      message: 'tooLong',
    });
}

export const freeStartDraftPayloadSchema = z
  .object({
    category: z.enum(['vehicle', 'property']),
    issueType: z
      .enum([
        'collision',
        'theft',
        'parking_damage',
        'insurer_delay',
        'water_damage',
        'storm_fire',
        'burglary',
        'landlord_dispute',
      ])
      .optional(),
    incidentDate: z.string().refine(isRealIsoDate, { message: 'invalidDate' }).optional(),
    counterparty: normalizedText(160).optional(),
    desiredOutcome: z
      .enum(['repair', 'reimbursement', 'compensation', 'written_response'])
      .optional(),
    summary: normalizedText(1000)
      .refine(value => !containsMedicalToken(value), { message: 'removeMedicalDetails' })
      .optional(),
    resumeStep: z.enum(['category', 'details', 'preview']).default('category'),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.issueType && !ISSUE_MATRIX[value.category].has(value.issueType)) {
      context.addIssue({
        code: 'custom',
        message: 'issueCategoryMismatch',
        path: ['issueType'],
      });
    }
  });

export type FreeStartDraftPayload = z.infer<typeof freeStartDraftPayloadSchema>;
