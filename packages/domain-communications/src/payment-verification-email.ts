import { sendEmail } from './email';
import type { EmailResult } from './sign-in-otp-email';
import { escapeHtml } from './email/templates/base';
import { resolveDoorDestination } from './email/door-destination';

export async function sendPaymentVerificationEmail(
  to: string,
  props: {
    leadName: string;
    status: string; // 'needs_info' | 'rejected'
    note?: string;
    amount: number;
    currency: string;
    link: string;
  }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };

  const link = resolveDoorDestination(props.link);
  const safeLink = escapeHtml(link);
  const subject = `Payment Verification Update: ${props.status === 'needs_info' ? 'Info Needed' : 'Rejected'}`;
  const statusLabel = props.status === 'needs_info' ? 'Needs Information' : 'Rejected';

  // MVP: Simple text/html construction without full template engine overhead
  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Payment Verification Update</h2>
      <p>Hello,</p>
      <p>The cash payment verification for <strong>${props.leadName}</strong> has been updated.</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Status:</strong> ${statusLabel}</p>
        <p><strong>Amount:</strong> ${(props.amount / 100).toFixed(2)} ${props.currency}</p>
        ${props.note ? `<p><strong>Note:</strong> ${props.note}</p>` : ''}
      </div>

      <p><a href="${safeLink}" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Dashboard</a></p>
    </div>
  `;

  return sendEmail(to, {
    subject,
    html,
    text: `Payment Verification Update for ${props.leadName}. Status: ${statusLabel}. Note: ${props.note || 'None'}. Link: ${link}`,
  });
}
