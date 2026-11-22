import { z } from 'zod';

// PostgreSQL text cannot preserve NUL or an unpaired UTF-16 surrogate.
const text = z
  .string()
  .min(1)
  .refine(value => !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value));

export const publishPlanVersionInputSchema = z.strictObject({
  planId: text,
  legalEntityId: text,
});

export const withdrawPlanVersionInputSchema = z.strictObject({ planVersionId: text });
export const getSaleOfferInputSchema = z.strictObject({ planId: text });

export const recordSaleInputSchema = z.strictObject({
  buyer: z.union([z.strictObject({ leadId: text }), z.strictObject({ memberUserId: text })]),
  planVersionId: text,
  termsVersion: text,
  rateId: text,
  amountMkdMinor: z.bigint().gt(0n).lte(9_223_372_036_854_775_807n),
  channel: z.enum(['cash', 'bank_transfer']),
  operationKey: text,
});

export type SaleInput = z.output<typeof recordSaleInputSchema>;
