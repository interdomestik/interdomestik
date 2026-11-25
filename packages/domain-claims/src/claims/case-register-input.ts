import { z } from 'zod';

// The action schema form admits checks, not transforms: commands trim after parsing.
export function registerText(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/\S/)
    .refine(value => !value.includes('\u0000'));
}

export const registerTimestamp = z.iso
  .datetime({ offset: true })
  .refine(value => Number.isFinite(Date.parse(value)));
export const registerId = z
  .string()
  .min(1)
  .refine(value => !value.includes('\u0000'));
export const registerUuid = z.uuid();

const registerUuidFields = [
  'correlationId',
  'inReplyToId',
  'recoveryAuthorityId',
  'representationAuthorityId',
  'sharingAuthorityId',
  'authorityId',
  'correspondenceId',
] as const;

const registerDisplayTextFields = [
  'partyOrganisation',
  'partyReference',
  'partyContactName',
  'body',
  'version',
  'purpose',
  'insuranceProofReference',
  'outsideHandlingParty',
] as const;

/**
 * Each write command normalizes its parsed input (the action schema form admits no transform):
 * display text is trimmed, and UUIDs are lower-cased because PostgreSQL returns them in lower case and
 * replay and basis lookups compare them as strings.
 */
export function normalizeRegisterInput<T extends object>(input: T): T {
  const result = { ...input } as Record<string, unknown>;
  for (const field of registerUuidFields) {
    const value = result[field];
    if (typeof value === 'string') result[field] = value.toLowerCase();
  }
  for (const field of registerDisplayTextFields) {
    const value = result[field];
    if (typeof value === 'string') result[field] = value.trim();
  }
  return result as T;
}
export const registerClaimInput = z.object({ claimId: registerId }).strict();

/** The largest register page; the web clamps request values to it before calling (R-20). */
export const REGISTER_MAX_PAGE_SIZE = 50;
export const registerPageInput = registerClaimInput.extend({
  page: z.number().int().min(1).max(100_000),
  perPage: z.number().int().min(1).max(REGISTER_MAX_PAGE_SIZE),
});
