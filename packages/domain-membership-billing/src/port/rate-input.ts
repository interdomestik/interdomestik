import { z } from 'zod';

import { scaledExchangeRate } from './money';
import { preservableText } from './sale-input';

const rateFields = {
  base: z.literal('EUR'),
  quote: z.literal('MKD'),
  rate: z.string().refine(rate => scaledExchangeRate(rate) !== null),
  effectiveOn: z.iso.date().refine(date => !date.startsWith('0000-')),
};

export const recordExchangeRateInputSchema = z.strictObject({
  ...rateFields,
  correctsRateId: z.string().min(1).optional(),
  correctionReason: z.string().regex(/\S/u).optional(),
});

export const scheduledExchangeRateInputSchema = z.strictObject({
  ...rateFields,
  tenantId: z.string(),
});

export const recordRateVerificationInputSchema = z.strictObject({
  legalEntityId: preservableText,
  rateId: preservableText,
  observedRate: rateFields.rate,
  sourceRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u),
  operationKey: z.uuid(),
});
