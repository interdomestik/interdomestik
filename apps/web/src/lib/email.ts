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

function getResendClient() {
  if (resendClient) return resendClient;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('Resend API key not configured. Emails will be skipped.');
    return null;
  }

  try {
    resendClient = new Resend(apiKey);
    return resendClient;
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

export async function sendEmail(
  to: string,
  template: { subject: string; html: string; text: string },
  options: { attachments?: { filename: string; content: Buffer | string }[] } = {}
) {
  const client = getResendClient();
  if (!client) {
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const response = await client.emails.send({
      from: getSenderAddress(),
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      attachments: options.attachments,
    });

    return { success: true, id: response.data?.id };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: 'Failed to send email' };
  }
}

export async function sendClaimSubmittedEmail(
  to: string,
  claim: { id: string; title: string; category: string }
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
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
) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderMemberWelcomeEmail(params));
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderPasswordResetEmail({ resetUrl }));
}

// ============================================================================
// PHASE 5: ENGAGEMENT & RETENTION EMAILS
// ============================================================================

export async function sendWelcomeEmail(to: string, name: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderWelcomeEmail({ name }));
}

export async function sendOnboardingEmail(to: string, name: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderOnboardingEmail({ name }));
}

export async function sendCheckinEmail(to: string, name: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderCheckinEmail({ name }));
}

export async function sendEngagementDay30Email(to: string, name: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay30Email({ name }));
}

export async function sendEngagementDay60Email(to: string, name: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay60Email({ name }));
}

export async function sendEngagementDay90Email(to: string, name: string) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay90Email({ name }));
}

export async function sendNewsletterEmail(
  to: string,
  props: Parameters<typeof renderNewsletterEmail>[0]
) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderNewsletterEmail(props));
}

export async function sendSeasonalEmail(
  to: string,
  props: Parameters<typeof renderSeasonalEmail>[0]
) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderSeasonalEmail(props));
}

export async function sendAnnualReportEmail(to: string, name: string, year: number) {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderAnnualReportEmail({ name, year }));
}
