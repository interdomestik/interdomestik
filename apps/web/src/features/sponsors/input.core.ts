import { z } from 'zod';
import { isValidRevisionInput } from '@interdomestik/domain-membership-billing/sponsors/terms';

const text = z.string().trim().min(1).max(300);
const optionalText = z
  .string()
  .trim()
  .max(300)
  .transform(value => value || null);
const integer = z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().safe());
const instant = z
  .string()
  .datetime({ offset: true })
  .transform(value => new Date(value));
const revisionFields = {
  seatCount: integer,
  pricePerSeatMinor: integer,
  currency: text,
  contractReference: text,
  termsVersion: text,
};
export const revisionSchema = z.object(revisionFields).refine(isValidRevisionInput);
export const sponsorSchema = z.object({
  leadId: text,
  legalName: text,
  registrationNumber: optionalText,
  taxNumber: optionalText,
  billingContactName: text,
  billingContactEmail: z.string().trim().email().max(254),
});
export const termSchema = z
  .object({
    sponsorId: text,
    termStart: instant,
    termEnd: instant,
    legalEntityId: text,
    planKey: text,
  })
  .refine(input => input.termEnd > input.termStart);
export const targetSchema = z.object({ sponsorId: text, termId: text });
export const decisionSchema = targetSchema.extend({
  revisionId: text,
  decision: z.enum(['approved', 'rejected']),
  invoiceReference: optionalText,
});
export const terminationSchema = targetSchema.extend({ effectiveAt: instant });
export const leftSchema = targetSchema.extend({ entryId: text });
export type SponsorOperation =
  | 'createSponsor'
  | 'createTerm'
  | 'addRevision'
  | 'decideRevision'
  | 'terminateTerm'
  | 'uploadRoster'
  | 'markLeftCompany';
