import { sendEmail } from './email';
import type { EmailResult } from './sign-in-otp-email';
import type { PaymentVerificationParams } from './email/source';
import { renderPaymentVerificationEmail } from './email/payment-verification';

export async function sendPaymentVerificationEmail(
  to: string,
  props: PaymentVerificationParams
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderPaymentVerificationEmail(props));
}
