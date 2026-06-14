import { describe, expect, it } from 'vitest';

import { buildInvoiceBillingDetails } from './invoice-payment-terms';

describe('buildInvoiceBillingDetails', () => {
  it('converts invoice due dates to Paddle day payment terms', () => {
    expect(
      buildInvoiceBillingDetails(new Date('2026-07-11T00:00:00Z'), new Date('2026-07-01T12:00:00Z'))
    ).toEqual({
      paymentTerms: {
        frequency: 10,
        interval: 'day',
      },
    });
  });

  it('uses at least one day when the due date has passed', () => {
    expect(
      buildInvoiceBillingDetails(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-02T00:00:00Z'))
    ).toEqual({
      paymentTerms: {
        frequency: 1,
        interval: 'day',
      },
    });
  });
});
