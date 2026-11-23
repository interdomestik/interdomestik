import {
  mintPaymentPortTestIngress,
  type ExchangeRateFixture,
  type rateInput,
} from '../../database/test/exchange-rates.fixture';

type PaymentPort = typeof import('../src/payment-port');
type ScheduledEvent = { data: ReturnType<typeof rateInput> & { tenantId: string } };

export type ExchangeRatePortFixture = ExchangeRateFixture & {
  port: PaymentPort;
  publish(input: unknown): ReturnType<PaymentPort['recordExchangeRate']>;
  scheduled(event: ScheduledEvent): ReturnType<PaymentPort['recordExchangeRateScheduled']>;
};

export async function createExchangeRatePortFixture(
  fixture: ExchangeRateFixture
): Promise<ExchangeRatePortFixture> {
  const port = await import('../src/payment-port');
  const { actor, authority } = fixture;
  return {
    ...fixture,
    port,
    publish: input => port.recordExchangeRate(authority, input, actor),
    scheduled: event =>
      port.recordExchangeRateScheduled(mintPaymentPortTestIngress('inngest'), event.data),
  };
}
