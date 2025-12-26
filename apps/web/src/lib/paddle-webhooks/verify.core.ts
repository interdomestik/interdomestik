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
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const allowDevBypass = process.env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV === 'true';

  if (isDevelopment && allowDevBypass) {
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

  const eventData = await params.paddle.webhooks.unmarshal(
    params.body,
    params.secret,
    params.signature
  );
  return { eventData, signatureValid: true, signatureBypassed: false };
}
