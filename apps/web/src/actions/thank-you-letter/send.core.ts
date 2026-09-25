import { sendEmail } from '@/lib/email';
import { renderThankYouLetterEmail } from '@/lib/email/thank-you-letter';
import { buildThankYouLetterParams } from './params.core';
import type {
  PreparedThankYouLetter,
  SendPreparedThankYouLetterParams,
  SendThankYouLetterParams,
} from './types';

export function prepareThankYouLetterCore(
  params: Omit<SendThankYouLetterParams, 'idempotencyKey'>
): PreparedThankYouLetter {
  return {
    to: params.email,
    ...renderThankYouLetterEmail(buildThankYouLetterParams(params)),
  };
}

export async function sendPreparedThankYouLetterCore(
  params: SendPreparedThankYouLetterParams
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const expectedIdempotencyKey = `membership-confirmation:v1:${params.tenantId}:${params.providerReference}`;
  if (params.idempotencyKey !== expectedIdempotencyKey) {
    return { success: false, error: 'Invalid confirmation idempotency key' };
  }
  return sendEmail(
    params.request.to,
    {
      subject: params.request.subject,
      html: params.request.html,
      text: params.request.text,
    },
    { idempotencyKey: params.idempotencyKey }
  );
}

export async function sendThankYouLetterCore(
  params: SendThankYouLetterParams
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    return await sendPreparedThankYouLetterCore({
      request: prepareThankYouLetterCore(params),
      providerReference: params.providerReference,
      tenantId: params.tenantId,
      idempotencyKey: params.idempotencyKey,
    });
  } catch (error) {
    console.error('[ThankYouLetter] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
