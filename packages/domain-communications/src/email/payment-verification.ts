import { escapeHtml } from './templates/base';
import type { EmailTemplate } from './templates/types';
import type { PaymentVerificationParams } from './source';
import { resolveDoorDestination } from './door-destination';

export function renderPaymentVerificationEmail(props: PaymentVerificationParams): EmailTemplate {
  const link = resolveDoorDestination(props.link);
  const safeLink = escapeHtml(link);
  const subject = `Payment Verification Update: ${props.status === 'needs_info' ? 'Info Needed' : 'Rejected'}`;
  const statusLabel = props.status === 'needs_info' ? 'Needs Information' : 'Rejected';

  const html = `
    <div style="font-family: sans-serif; padding: 20px;">
      <h2>Payment Verification Update</h2>
      <p>Hello,</p>
      <p>The cash payment verification for <strong>${escapeHtml(props.leadName)}</strong> has been updated.</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Status:</strong> ${statusLabel}</p>
        <p><strong>Amount:</strong> ${(props.amount / 100).toFixed(2)} ${escapeHtml(props.currency)}</p>
        ${props.note ? `<p><strong>Note:</strong> ${escapeHtml(props.note)}</p>` : ''}
      </div>

      <p><a href="${safeLink}" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Dashboard</a></p>
    </div>
  `;

  return {
    subject,
    html,
    text: `Payment Verification Update for ${props.leadName}. Status: ${statusLabel}. Note: ${props.note || 'None'}. Link: ${link}`,
    source: { version: 1, kind: 'cash', params: { ...props, link } },
  };
}
