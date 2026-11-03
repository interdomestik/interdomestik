import { TEST_PADDLE_DELIVERY } from './_core.test-support';
import { handlePaddleWebhookEntityCore } from './_core';

type EntityCoreParams = Parameters<typeof handlePaddleWebhookEntityCore>[0];

// One delivery of a completed transaction to the route for `expectedEntity`, with that entity's secret.
export function runEntityCore(
  expectedEntity: EntityCoreParams['expectedEntity'],
  signature: string
): ReturnType<typeof handlePaddleWebhookEntityCore> {
  return handlePaddleWebhookEntityCore({
    expectedEntity,
    paddle: { mocked: true } as never,
    headers: new Headers({ 'paddle-signature': signature }),
    signature,
    secret: `whsec_${expectedEntity}`,
    bodyText: '{"event_type":"transaction.completed"}',
  });
}

// A verified, signature-valid completed transaction carrying the given custom data.
export function verifiedTransaction(eventId: string, customData: Record<string, string>) {
  return {
    eventData: {
      eventType: 'transaction.completed',
      eventId,
      data: { customData },
    },
    signatureValid: true,
    signatureBypassed: false,
    delivery: TEST_PADDLE_DELIVERY,
  };
}
