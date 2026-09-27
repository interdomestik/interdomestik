import { getResendClient, getSenderAddress, sendEmail } from './email';
import { renderPaymentFailedEmail } from './email-templates';
import { createEmailTelemetry, sendViaResend, type EmailResult } from './sign-in-otp-email';

/**
 * Day 0: Send when payment fails (subscription.past_due)
 */
export async function sendPaymentFailedEmail(
  to: string,
  params: {
    memberName: string;
    planName: string;
    gracePeriodDays: number;
    gracePeriodEndDate: string;
  }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  console.log(`[Dunning] Sending Day 0 email to ${to}`);
  return sendEmail(to, renderPaymentFailedEmail(params));
}

/** Freeze the full request before an ordered Paddle state commits. */
export function preparePastDueEmail(
  to: string,
  params: Parameters<typeof sendPaymentFailedEmail>[1]
): { from: string; to: string; subject: string; html: string; text: string } {
  return { from: getSenderAddress(), to, ...renderPaymentFailedEmail(params) };
}

/** Recoverable dunning sends require provider dedupe; arbitrary SMTP cannot supply it. */
export async function sendPreparedPastDueEmail(
  request: ReturnType<typeof preparePastDueEmail>,
  idempotencyKey: string
): Promise<EmailResult> {
  if (process.env.INTERDOMESTIK_AUTOMATED === '1' || process.env.PLAYWRIGHT === '1')
    return { success: true, id: `mock:${idempotencyKey}` };
  const telemetry = createEmailTelemetry('content-free');
  const client = getResendClient(telemetry);
  if (!client) return { success: false, error: 'Idempotent email provider unavailable' };
  return sendViaResend(client, request.from, request.to, request, { idempotencyKey }, telemetry);
}

export const paddleDunningEmailDeps = {
  sendPaymentFailedEmail,
  preparePastDueEmail,
  sendPreparedPastDueEmail,
};
