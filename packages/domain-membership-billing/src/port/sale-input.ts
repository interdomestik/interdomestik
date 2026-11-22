import { z } from 'zod';

// PostgreSQL text cannot preserve NUL or an unpaired UTF-16 surrogate.
const text = z
  .string()
  .min(1)
  .superRefine((value, ctx) => {
    if (value === '' || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) {
      ctx.addIssue({
        origin: 'string',
        code: 'invalid_format',
        format: 'regex',
        // Preserve the pattern in Zod's issue and default message.
        pattern: String.raw`/^[^\u0000\uD800-\uDFFF]+$/u`,
      });
    }
  });

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
