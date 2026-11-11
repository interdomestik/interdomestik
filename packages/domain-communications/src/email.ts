import { resolveDeploymentOrigin } from './deployment-origin.mjs';
import {
  isAutomatedEmail as isAutomated,
  selectEmailRecipients,
  suppressedEmailResult,
  type EmailRecipients,
} from './non-sending-email';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
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
import {
  createEmailTelemetry,
  automatedSmtpTarget,
  fallbackResend,
  smtpTransport,
  renderSignInOtpEmail,
  sendViaResend,
  type EmailResult,
  type EmailSendOptions,
  type EmailTelemetry,
  type SignInOtpLocale,
} from './sign-in-otp-email';
export { isEmailSuppressed } from './non-sending-email';
export { normalizeSignInOtpLocale } from './sign-in-otp-email';
export type { EmailResult };
let resendClient: Resend | null = null;
export function getResendClient(telemetry = createEmailTelemetry()) {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    resendClient = new Resend(apiKey);
    return resendClient;
  } catch (error) {
    telemetry.failed('resend', 'client_initialization', () =>
      console.warn('Failed to initialize Resend client:', error)
    );
    return null;
  }
}
function getEmailClient(telemetry: EmailTelemetry, options: EmailSendOptions) {
  // Priority 0: Automated Testing (mock, or the loopback catcher for messages that opt in)
  if (isAutomated()) {
    const target = options.automatedCatcher ? automatedSmtpTarget() : null;
    if (target === null || target === 'rejected') return target;
    return { type: 'smtp' as const, client: smtpTransport(target), testOnly: true };
  }

  // Priority 1: SMTP (Docker / Local Dev)
  if (process.env.SMTP_HOST) {
    const port = Number.parseInt(process.env.SMTP_PORT || '1025');
    return { type: 'smtp' as const, client: smtpTransport({ host: process.env.SMTP_HOST, port }) };
  }

  // Priority 2: Resend (Production / Preview)
  if (!process.env.RESEND_API_KEY) {
    telemetry.unavailable('none', () =>
      console.warn('Resend API key not configured. Emails will be skipped.')
    );
    return null;
  }

  const resend = getResendClient(telemetry);
  if (resend) return { type: 'resend', client: resend };

  return null;
}
export function getSenderAddress() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    process.env.RESEND_FROM ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
    'Interdomestik <no-reply@interdomestik.com>'
  );
}
export async function sendEmail(
  recipients: EmailRecipients,
  template: { subject: string; html: string; text: string },
  options: EmailSendOptions = {}
): Promise<EmailResult> {
  const to = selectEmailRecipients(recipients, options.automatedCatcher);
  if (!to) return suppressedEmailResult;
  resolveDeploymentOrigin();
  const telemetry = createEmailTelemetry(options.telemetryPolicy);
  const provider = getEmailClient(telemetry, options);
  if (provider === 'rejected') return { success: false, error: 'Email provider not configured' };
  if (!provider) {
    // If testing and no provider, just mock success
    if (isAutomated()) {
      telemetry.sent('mock', () =>
        console.log(`[MockEmail] To: ${to}, Subject: ${template.subject}`)
      );
      return { success: true, id: 'mock-id' };
    }
    return { success: false, error: 'Email provider not configured' };
  }

  try {
    if (provider.type === 'smtp') {
      try {
        const info = await (provider.client as nodemailer.Transporter).sendMail({
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

export {
  sendWelcomeEmail,
  sendOnboardingEmail,
  sendCheckinEmail,
  sendEngagementDay30Email,
  sendEngagementDay60Email,
  sendEngagementDay90Email,
  sendNewsletterEmail,
  sendSeasonalEmail,
  sendNpsSurveyEmail,
} from './engagement-email';

export { sendPaymentVerificationEmail } from './payment-verification-email';

export {
  sendPaymentFailedEmail,
  preparePastDueEmail,
  sendPreparedPastDueEmail,
  paddleDunningEmailDeps,
} from './dunning-email';
