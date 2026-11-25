import { sendEmail } from './email-delivery';
import {
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
  renderPaymentFinalWarningEmail,
  renderPaymentReminderEmail,
  renderSeasonalEmail,
  renderStatusChangedEmail,
  renderWelcomeEmail,
} from './email-templates';
import { renderSignInOtpEmail, type EmailResult, type SignInOtpLocale } from './sign-in-otp-email';

export { getResendClient, sendEmail } from './email-delivery';
export { isEmailSuppressed } from './non-sending-email';
export {
  configuredEmailTransports,
  getSenderAddress,
  sendEmailOutcome,
  type EmailTransport,
} from './email-transport';
export { normalizeSignInOtpLocale } from './sign-in-otp-email';
export type { EmailResult };

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
