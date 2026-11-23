import { z } from 'zod';

// PostgreSQL text cannot preserve NUL or an unpaired UTF-16 surrogate.
const text = z
  .string()
  .min(1)
  .regex(/^[^\u0000\uD800-\uDFFF]+$/u);

export const publishPlanVersionInputSchema = z.strictObject({
  planId: text,
  legalEntityId: text,
});

export const withdrawPlanVersionInputSchema = z.strictObject({ planVersionId: text });
export const getSaleOfferInputSchema = z.strictObject({ planId: text });

export const recordSaleInputSchema = z.strictObject({
  buyer: z.strictObject({ leadId: text.optional(), memberUserId: text.optional() }),
  planVersionId: text,
  termsVersion: text,
  rateId: text,
  amountMkdMinor: z.bigint().gt(0n).lte(9_223_372_036_854_775_807n),
  channel: z.enum(['cash', 'bank_transfer']),
  operationKey: text,
});

export type SaleInput = Omit<z.output<typeof recordSaleInputSchema>, 'buyer'> & {
  buyer: { leadId: string } | { memberUserId: string };
};
