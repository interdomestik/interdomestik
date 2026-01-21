import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import {
  renderAnnualReportEmail,
  renderCheckinEmail,
  renderClaimAssignedEmail,
  renderClaimSubmittedEmail,
  renderEngagementDay30Email,
  renderEngagementDay60Email,
  renderEngagementDay90Email,
  renderMemberWelcomeEmail,
  renderNewMessageEmail,
  renderNewsletterEmail,
  renderNpsSurveyEmail,
  renderOnboardingEmail,
  renderPasswordResetEmail,
  renderPaymentFailedEmail,
  renderPaymentFinalWarningEmail,
  renderPaymentReminderEmail,
  renderSeasonalEmail,
  renderStatusChangedEmail,
  renderWelcomeEmail,
} from './email-templates';

let resendClient: Resend | null = null;
let smtpTransporter: nodemailer.Transporter | null = null;

function getEmailClient() {
  // Priority 0: Automated Testing (Mock)
  // Always return null to force mock path in sendEmail
  if (process.env.INTERDOMESTIK_AUTOMATED === '1' || process.env.PLAYWRIGHT === '1') {
    return null;
  }

  // Priority 1: SMTP (Docker / Local Dev)
  if (process.env.SMTP_HOST) {
    if (!smtpTransporter) {
      smtpTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '1025'),
        secure: false, // Mailpit usually runs plain or Upgrade
        ignoreTLS: true,
      });
    }
    return { type: 'smtp', client: smtpTransporter };
  }

  // Priority 2: Resend (Production / Preview)
  if (resendClient) return { type: 'resend', client: resendClient };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('Resend API key not configured. Emails will be skipped.');
    return null;
  }

  try {
    resendClient = new Resend(apiKey);
    return { type: 'resend', client: resendClient };
  } catch (error) {
    console.warn('Failed to initialize Resend client:', error);
    return null;
  }
}

function getSenderAddress() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    process.env.RESEND_FROM ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
    'Interdomestik <no-reply@interdomestik.com>'
  );
}

export type EmailResult = { success: true; id: string } | { success: false; error: string };

export async function sendEmail(
  to: string,
  template: { subject: string; html: string; text: string },
  options: { attachments?: { filename: string; content: Buffer | string }[] } = {}
): Promise<EmailResult> {
  const provider = getEmailClient();
  if (!provider) {
    // If testing and no provider, just mock success
    if (process.env.INTERDOMESTIK_AUTOMATED === '1') {
      console.log(`[MockEmail] To: ${to}, Subject: ${template.subject}`);
      return { success: true, id: 'mock-id' };
    }
    return { success: false, error: 'Email provider not configured' };
  }

  try {
    if (provider.type === 'smtp') {
      const info = await (provider.client as nodemailer.Transporter).sendMail({
        from: getSenderAddress(),
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments: options.attachments,
      });
      console.log(`[SMTP] Email sent to ${to}: ${info.messageId}`);
      return { success: true, id: info.messageId };
    } else {
      const client = provider.client as Resend;
      const response = await client.emails.send({
        from: getSenderAddress(),
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
        attachments: options.attachments,
      });

      if (response.error) {
        console.error('Resend error:', response.error);
        return { success: false, error: response.error.message };
      }

      if (!response.data?.id) {
        return { success: false, error: 'No email ID returned from Resend' };
      }

      return { success: true, id: response.data.id };
    }
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

export async function sendClaimSubmittedEmail(
  to: string,
  claim: { id: string; title: string; category: string }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(
    to,
    renderClaimSubmittedEmail({
      claimId: claim.id,
      claimTitle: claim.title,
      category: claim.category,
    })
  );
}

export async function sendClaimAssignedEmail(
  to: string,
  claim: { id: string; title: string },
  agentName: string
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(
    to,
    renderClaimAssignedEmail({
      claimId: claim.id,
      claimTitle: claim.title,
      agentName,
    })
  );
}

export async function sendStatusChangedEmail(
  to: string,
  claim: { id: string; title: string },
  oldStatus: string,
  newStatus: string
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(
    to,
    renderStatusChangedEmail({
      claimId: claim.id,
      claimTitle: claim.title,
      oldStatus,
      newStatus,
    })
  );
}

export async function sendNewMessageEmail(
  to: string,
  claim: { id: string; title: string },
  senderName: string,
  messagePreview: string
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(
    to,
    renderNewMessageEmail({
      claimId: claim.id,
      claimTitle: claim.title,
      senderName,
      messagePreview,
    })
  );
}

// ============================================================================
// DUNNING EMAILS
// ============================================================================

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

/**
 * Day 7: Send reminder (7 days remaining)
 */
export async function sendPaymentReminderEmail(
  to: string,
  params: {
    memberName: string;
    planName: string;
    daysRemaining: number;
    gracePeriodEndDate: string;
  }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  console.log(`[Dunning] Sending Day 7 reminder to ${to}`);
  return sendEmail(to, renderPaymentReminderEmail(params));
}

/**
 * Day 13: Send final warning (1 day remaining)
 */
export async function sendPaymentFinalWarningEmail(
  to: string,
  params: {
    memberName: string;
    planName: string;
    gracePeriodEndDate: string;
  }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  console.log(`[Dunning] Sending Day 13 FINAL WARNING to ${to}`);
  return sendEmail(to, renderPaymentFinalWarningEmail(params));
}

export async function sendMemberWelcomeEmail(
  to: string,
  params: {
    memberName: string;
    agentName: string;
  }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderMemberWelcomeEmail(params));
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderPasswordResetEmail({ resetUrl }));
}

// ============================================================================
// PHASE 5: ENGAGEMENT & RETENTION EMAILS
// ============================================================================

export async function sendWelcomeEmail(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderWelcomeEmail({ name }));
}

export async function sendOnboardingEmail(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderOnboardingEmail({ name }));
}

export async function sendCheckinEmail(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderCheckinEmail({ name }));
}

export async function sendEngagementDay30Email(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay30Email({ name }));
}

export async function sendEngagementDay60Email(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay60Email({ name }));
}

export async function sendEngagementDay90Email(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay90Email({ name }));
}

export async function sendNewsletterEmail(
  to: string,
  props: Parameters<typeof renderNewsletterEmail>[0]
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderNewsletterEmail(props));
}

export async function sendSeasonalEmail(
  to: string,
  props: Parameters<typeof renderSeasonalEmail>[0]
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderSeasonalEmail(props));
}

export async function sendNpsSurveyEmail(
  to: string,
  props: { name: string; token: string }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderNpsSurveyEmail(props));
}

export async function sendAnnualReportEmail(
  to: string,
  name: string,
  year: number
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderAnnualReportEmail({ name, year }));
}

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

      <p><a href="${props.link}" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View in Dashboard</a></p>
    </div>
  `;

  return sendEmail(to, {
    subject,
    html,
    text: `Payment Verification Update for ${props.leadName}. Status: ${statusLabel}. Note: ${props.note || 'None'}. Link: ${props.link}`,
  });
}
