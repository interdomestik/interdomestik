import type { insertWebhookEvent } from './persist';

type ReceiptParams = Parameters<typeof insertWebhookEvent>[0];

export function subscriptionCreatedReceipt(suffix: string): ReceiptParams {
  return {
    headers: new Headers(),
    processingScopeKey: 'tenant:tenant_mk',
    dedupeKey: `paddle:tenant:tenant_mk:event:evt_${suffix}`,
    eventType: 'subscription.created',
    eventId: `evt_${suffix}`,
    eventTimestamp: new Date('2026-09-25T08:00:00.000Z'),
    payloadHash: `hash_${suffix}`,
    parsedPayload: { data: { id: `sub_${suffix}` } },
    signatureValid: true,
    signatureBypassed: false,
    tenantId: 'tenant_mk',
  };
}
