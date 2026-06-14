const DAY_MS = 24 * 60 * 60 * 1000;

export function buildInvoiceBillingDetails(invoiceDueAt: Date, now = new Date()) {
  const frequency = Math.max(1, Math.ceil((invoiceDueAt.getTime() - now.getTime()) / DAY_MS));
  return {
    paymentTerms: {
      frequency,
      interval: 'day',
    },
  };
}
