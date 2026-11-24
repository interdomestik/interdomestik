import { z } from 'zod';

// PostgreSQL text cannot preserve NUL or an unpaired UTF-16 surrogate.
export const preservableText = z
  .string()
  .min(1)
  .regex(/^[^\0\uD800-\uDFFF]+$/u);

export const publishPlanVersionInputSchema = z.strictObject({
  planId: preservableText,
  legalEntityId: preservableText,
});

export const withdrawPlanVersionInputSchema = z.strictObject({ planVersionId: preservableText });
export const getSaleOfferInputSchema = z.strictObject({ planId: preservableText });

export const recordSaleInputSchema = z.strictObject({
  buyer: z.strictObject({
    leadId: preservableText.optional(),
    memberUserId: preservableText.optional(),
  }),
  planVersionId: preservableText,
  termsVersion: preservableText,
  rateId: preservableText,
  amountMkdMinor: z.bigint().gt(0n).lte(9_223_372_036_854_775_807n),
  channel: z.enum(['cash', 'bank_transfer']),
  operationKey: preservableText.max(255),
});

export type SaleInput = Omit<z.output<typeof recordSaleInputSchema>, 'buyer'> & {
  buyer: { leadId: string } | { memberUserId: string };
};

export function validateSaleBuyer(
  buyer: z.output<typeof recordSaleInputSchema>['buyer']
):
  | { ok: true; buyer: SaleInput['buyer'] }
  | { ok: false; issues: { buyer: 'invalid_union' | 'unrecognized_keys' } } {
  const { leadId, memberUserId } = buyer;
  if (leadId !== undefined && !Object.hasOwn(buyer, 'memberUserId')) {
    return { ok: true, buyer: { leadId } };
  }
  if (memberUserId !== undefined && !Object.hasOwn(buyer, 'leadId')) {
    return { ok: true, buyer: { memberUserId } };
  }
  // In the original strict union, one valid ID with an extra undefined key produced
  // the single branch's unrecognized_keys issue. Both or neither ID produced invalid_union.
  const issue =
    (leadId === undefined) === (memberUserId === undefined) ? 'invalid_union' : 'unrecognized_keys';
  return { ok: false, issues: { buyer: issue } };
}
