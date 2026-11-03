import type { IngressCapability } from '@interdomestik/database/ingress';
import { mintIngressCapability } from '@interdomestik/database/ingress-registrar';
import type { Paddle } from '@paddle/paddle-node-sdk';

import {
  resolveBillingEntityConfig,
  resolveBillingTenantIdForEntity,
  type BillingEntity,
} from '../paddle-server';

export type VerifiedPaddleWebhook = {
  eventData: unknown;
  signatureValid: boolean;
  signatureBypassed: boolean;
  /**
   * The verified-delivery capability: minted only after the Paddle signature verified (or, under
   * the test runner only, the explicit test bypass). Webhook processing needs it, together with a
   * resolver-produced owner, to obtain any tenant authority. On an entity route it is also bound
   * to that entity's billing tenant, which is what billing-scope authorities check against; a
   * delivery verified with the legacy shared secret stays unbound.
   */
  delivery: IngressCapability<'paddle-delivery'>;
};

export async function verifyPaddleWebhook(params: {
  paddle: Paddle;
  body: string;
  secret: string;
  signature: string;
  parsedPayload: Record<string, unknown>;
  /**
   * The entity route that received the delivery. When present, the entity's own webhook secret is
   * the only secret accepted and the delivery is bound to the entity's billing tenant.
   */
  billingEntity?: BillingEntity;
}): Promise<VerifiedPaddleWebhook> {
  const allowDevBypass =
    process.env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV === 'true' ||
    process.env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV === '1';
  const isTest = process.env.NODE_ENV === 'test';

  if (allowDevBypass) {
    if (!isTest) {
      throw new Error('PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV is only allowed in tests.');
    }
    console.warn('[Webhook] DEV MODE: Paddle signature verification bypass ENABLED');
    const parsedBody = params.parsedPayload;
    return {
      eventData: {
        eventType: (parsedBody['event_type'] as string | undefined) || 'unknown',
        eventId:
          (parsedBody['event_id'] as string | undefined) ||
          (parsedBody['eventId'] as string | undefined) ||
          (parsedBody['id'] as string | undefined),
        data: parsedBody['data'],
      },
      signatureValid: false,
      signatureBypassed: true,
      delivery: mintIngressCapability('paddle-delivery', Date.now(), {
        billingTenantId: params.billingEntity
          ? resolveBillingTenantIdForEntity(params.billingEntity)
          : undefined,
      }),
    };
  }

  // On an entity route the secret comes from the entity's own configuration, never from the
  // legacy shared secret, and a caller-supplied secret that differs from it is refused.
  let billingTenantId: string | undefined;
  if (params.billingEntity) {
    const config = resolveBillingEntityConfig(params.billingEntity, {
      allowLegacyFallback: false,
    });
    if (params.secret !== config.webhookSecret) {
      throw new Error('[Paddle] Webhook secret does not belong to the billing entity');
    }
    billingTenantId = config.tenantId;
  }

  // Validate the signature cryptographically, but avoid unmarshalling into
  // Paddle SDK event classes here. Those classes expect the full Paddle payload
  // shape and will throw for minimal/partial payloads (e.g. in tests), which we
  // already parse/handle ourselves.
  const signatureValid = await params.paddle.webhooks.isSignatureValid(
    params.body,
    params.secret,
    params.signature
  );

  if (!signatureValid) {
    throw new Error('[Paddle] Webhook signature verification failed');
  }

  const parsedBody = params.parsedPayload;
  return {
    eventData: {
      eventType: (parsedBody['event_type'] as string | undefined) || 'unknown',
      eventId:
        (parsedBody['event_id'] as string | undefined) ||
        (parsedBody['eventId'] as string | undefined) ||
        (parsedBody['id'] as string | undefined),
      data: parsedBody['data'],
    },
    signatureValid: true,
    signatureBypassed: false,
    delivery: mintIngressCapability('paddle-delivery', Date.now(), { billingTenantId }),
  };
}
