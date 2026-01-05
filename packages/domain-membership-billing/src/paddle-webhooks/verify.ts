import type { Paddle } from '@paddle/paddle-node-sdk';

export type VerifiedPaddleWebhook = {
  eventData: unknown;
  signatureValid: boolean;
  signatureBypassed: boolean;
};

export async function verifyPaddleWebhook(params: {
  paddle: Paddle;
  body: string;
  secret: string;
  signature: string;
  parsedPayload: Record<string, unknown>;
}): Promise<VerifiedPaddleWebhook> {
  const allowDevBypass =
    process.env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV === 'true' ||
    process.env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV === '1';
  const isProduction = process.env.NODE_ENV === 'production';
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
    };
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
  };
}
