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

const checkFields = {
  legalEntityId: preservableText,
  operationKey: z.uuid(),
};

export const beginRateCheckInputSchema = z.strictObject(checkFields);

export const recordRateCheckInconclusiveInputSchema = z.strictObject({
  ...checkFields,
  checkId: preservableText,
  reason: preservableText.max(256).regex(/\S/u),
});

export const recordRateVerificationInputSchema = z.strictObject({
  ...checkFields,
  // Legacy evidence can be replayed using the original request.
  checkId: preservableText.optional(),
  rateId: preservableText,
  observedRate: rateFields.rate,
  sourceRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/u),
});
