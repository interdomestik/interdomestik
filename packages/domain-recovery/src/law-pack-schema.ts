import { z } from 'zod';

const ISO_COUNTRY_CODE = /^[A-Z]{2}$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const countryCodeSchema = z
  .string()
  .trim()
  .transform(value => value.toUpperCase())
  .pipe(z.string().regex(ISO_COUNTRY_CODE));

export const lawPackSchema = z
  .object({
    countryCode: countryCodeSchema,
    recoveryLaw: countryCodeSchema,
    recoveryLegalTenantId: z.string().trim().min(1),
    regulatedActivityNoteRequired: z.literal(true),
    owner: z.string().trim().min(1),
    effectiveFrom: z.string().regex(DATE_ONLY),
    lastReviewed: z.string().regex(DATE_ONLY),
    sourceReferences: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

export type LawPack = z.infer<typeof lawPackSchema>;

export class InvalidLawPackError extends Error {
  readonly code = 'invalid_law_pack' as const;

  constructor(readonly cause: unknown) {
    super('Invalid recovery law pack');
    this.name = 'InvalidLawPackError';
  }
}

export function validateLawPack(value: unknown): LawPack {
  const result = lawPackSchema.safeParse(value);

  if (!result.success) {
    throw new InvalidLawPackError(result.error);
  }

  return result.data;
}
