import type { Transporter } from 'nodemailer';
import type { Resend } from 'resend';
import { getResendClient, getResendProvider, unconfiguredEmailResult } from './email-delivery';
import {
  renderClaimAssignedEmail,
  renderClaimSubmittedEmail,
  renderMemberWelcomeEmail,
  renderNewMessageEmail,
  renderPasswordResetEmail,
  renderPaymentFinalWarningEmail,
  renderPaymentReminderEmail,
  renderStatusChangedEmail,
} from './email-templates';
import { configuredSmtpTarget, getSenderAddress } from './email-transport';
import { createEngagementEmailSenders } from './engagement-email';
import {
  isAutomatedEmail as isAutomated,
  selectEmailRecipients,
  suppressedEmailResult,
  type EmailRecipients,
} from './non-sending-email';
import {
  createEmailTelemetry,
  fallbackResend,
  renderSignInOtpEmail,
  sendViaResend,
  smtpTransport,
  type EmailResult,
  type EmailSendOptions,
  type EmailTelemetry,
  type SignInOtpLocale,
} from './sign-in-otp-email';

export { getResendClient } from './email-delivery';
export { isEmailSuppressed } from './non-sending-email';
export {
  configuredEmailTransports,
  getSenderAddress,
  sendEmailOutcome,
  type EmailTransport,
} from './email-transport';
export { normalizeSignInOtpLocale } from './sign-in-otp-email';
export type { EmailResult };

function getEmailClient(telemetry: EmailTelemetry, options: EmailSendOptions) {
  const target = configuredSmtpTarget(options.automatedCatcher ?? false);
  if (target === 'rejected') return target;
  if (target) {
    return {
      type: 'smtp' as const,
      client: smtpTransport(target),
      ...(isAutomated() && { testOnly: true }),
    };
  }
  if (isAutomated()) return null;
  return getResendProvider(telemetry);
}

export async function sendEmail(
  recipients: EmailRecipients,
  template: { subject: string; html: string; text: string },
  options: EmailSendOptions = {}
): Promise<EmailResult> {
  const to = selectEmailRecipients(recipients, options.automatedCatcher);
  if (!to) return suppressedEmailResult;
  const telemetry = createEmailTelemetry(options.telemetryPolicy);
  const provider = getEmailClient(telemetry, options);
  if (provider === 'rejected') return { success: false, error: 'Email provider not configured' };
  if (!provider) return unconfiguredEmailResult(to, template, telemetry);

  try {
    if (provider.type === 'smtp') {
      if (options.canDispatch?.() === false) {
        return { success: false, error: 'email_dispatch_blocked' };
      }
      try {
        const info = await (provider.client as Transporter).sendMail({
          from: getSenderAddress(),
          to,
          subject: template.subject,
          html: template.html,
          text: template.text,
          attachments: options.attachments,
        });
        telemetry.sent('smtp', () => console.log(`[SMTP] Email sent to ${to}: ${info.messageId}`));
        return { success: true, id: info.messageId };
      } catch (smtpError) {
        const resend = fallbackResend(provider, () => getResendClient(telemetry));
        if (!resend) throw smtpError;

        telemetry.fallback('smtp', () =>
          console.warn('SMTP delivery failed, falling back to Resend:', smtpError)
        );
        return sendViaResend(resend, getSenderAddress(), to, template, options, telemetry);
      }
    } else {
      const client = provider.client as Resend;
      return sendViaResend(client, getSenderAddress(), to, template, options, telemetry);
    }
  } catch (error) {
    telemetry.failed(provider.type === 'smtp' ? 'smtp' : 'resend', 'delivery', () =>
      console.error('Failed to send email:', error)
    );
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

// Credential links and codes: automated runs catch them on loopback; telemetry is content-free.
const CREDENTIAL_EMAIL = { automatedCatcher: true, telemetryPolicy: 'content-free' } as const;

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderPasswordResetEmail({ resetUrl }), CREDENTIAL_EMAIL);
}

export async function sendSignInOtpEmail(
  to: string,
  otp: string,
  locale: SignInOtpLocale = 'en'
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderSignInOtpEmail(otp, locale), CREDENTIAL_EMAIL);
}

export const {
  sendWelcomeEmail,
  sendOnboardingEmail,
  sendCheckinEmail,
  sendEngagementDay30Email,
  sendEngagementDay60Email,
  sendEngagementDay90Email,
  sendNewsletterEmail,
  sendSeasonalEmail,
  sendNpsSurveyEmail,
} = createEngagementEmailSenders(sendEmail);

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

export {
  sendPaymentFailedEmail,
  preparePastDueEmail,
  sendPreparedPastDueEmail,
  paddleDunningEmailDeps,
} from './dunning-email';
