type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

type TemplateOptions = {
  title: string;
  intro: string;
  details?: string[];
  ctaLabel: string;
  ctaUrl: string;
  footer?: string;
};

const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Interdomestik';
const DEFAULT_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  verification: 'Verification',
  evaluation: 'Evaluation',
  negotiation: 'Negotiation',
  court: 'Court',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function joinUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.replace(/\/$/, '');
  const trimmedPath = path.replace(/^\//, '');
  return `${trimmedBase}/${trimmedPath}`;
}

function buildEmailTemplate({
  title,
  intro,
  details,
  ctaLabel,
  ctaUrl,
  footer,
}: TemplateOptions): EmailTemplate {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safeFooter = escapeHtml(footer || `${DEFAULT_APP_NAME} Team`);

  const detailsHtml = (details || [])
    .map(line => `<li style="margin: 4px 0;">${escapeHtml(line)}</li>`)
    .join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background:#f7f7f8; font-family: Arial, sans-serif; color:#111827;">
    <div style="max-width:600px; margin:0 auto; padding:32px 20px;">
      <div style="background:#ffffff; border-radius:16px; padding:28px; box-shadow:0 4px 20px rgba(15, 23, 42, 0.06);">
        <h1 style="margin:0 0 12px; font-size:22px; font-weight:700;">${safeTitle}</h1>
        <p style="margin:0 0 18px; font-size:15px; line-height:1.6; color:#374151;">${safeIntro}</p>
        ${detailsHtml ? `<ul style="margin:0 0 20px; padding-left:18px; font-size:14px; color:#4b5563;">${detailsHtml}</ul>` : ''}
        <a href="${safeCtaUrl}" style="display:inline-block; background:#0f766e; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:10px; font-size:14px; font-weight:600;">
          ${safeCtaLabel}
        </a>
      </div>
      <p style="margin:16px 0 0; font-size:12px; color:#6b7280; text-align:center;">${safeFooter}</p>
    </div>
  </body>
</html>`;

  const textParts = [title, intro];
  if (details?.length) {
    textParts.push(details.join('\n'));
  }
  textParts.push(`${ctaLabel}: ${ctaUrl}`);
  textParts.push(footer || `${DEFAULT_APP_NAME} Team`);

  return {
    subject: title,
    html,
    text: textParts.join('\n\n'),
  };
}

export function renderClaimSubmittedEmail(params: {
  claimId: string;
  claimTitle: string;
  category: string;
}) {
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/dashboard/claims/${params.claimId}`);
  return buildEmailTemplate({
    title: 'We received your claim',
    intro: `Your claim "${params.claimTitle}" has been submitted successfully.`,
    details: [`Category: ${params.category}`, `Claim ID: ${params.claimId}`],
    ctaLabel: 'View claim',
    ctaUrl: claimUrl,
  });
}

export function renderClaimAssignedEmail(params: {
  claimId: string;
  claimTitle: string;
  agentName: string;
}) {
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/agent/claims/${params.claimId}`);
  return buildEmailTemplate({
    title: 'A new claim was assigned to you',
    intro: `"${params.claimTitle}" is now assigned to ${params.agentName}.`,
    details: [`Claim ID: ${params.claimId}`],
    ctaLabel: 'Review claim',
    ctaUrl: claimUrl,
  });
}

export function renderStatusChangedEmail(params: {
  claimId: string;
  claimTitle: string;
  oldStatus: string;
  newStatus: string;
}) {
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/dashboard/claims/${params.claimId}`);
  return buildEmailTemplate({
    title: `Claim status updated to ${formatStatusLabel(params.newStatus)}`,
    intro: `Your claim "${params.claimTitle}" has moved from ${formatStatusLabel(
      params.oldStatus
    )} to ${formatStatusLabel(params.newStatus)}.`,
    details: [`Claim ID: ${params.claimId}`],
    ctaLabel: 'View claim',
    ctaUrl: claimUrl,
  });
}

export function renderNewMessageEmail(params: {
  claimId: string;
  claimTitle: string;
  senderName: string;
  messagePreview: string;
}) {
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/dashboard/claims/${params.claimId}`);
  const preview = params.messagePreview.slice(0, 160);
  return buildEmailTemplate({
    title: 'New message on your claim',
    intro: `${params.senderName} sent a message about "${params.claimTitle}".`,
    details: [preview, `Claim ID: ${params.claimId}`],
    ctaLabel: 'Reply now',
    ctaUrl: claimUrl,
  });
}

// ============================================================================
// DUNNING EMAIL TEMPLATES
// ============================================================================

/**
 * Day 0: Payment Failed - Immediate notification
 */
export function renderPaymentFailedEmail(params: {
  memberName: string;
  planName: string;
  gracePeriodDays: number;
  gracePeriodEndDate: string;
}) {
  const updatePaymentUrl = joinUrl(DEFAULT_APP_URL, '/dashboard/membership');
  return buildEmailTemplate({
    title: '⚠️ Payment Failed - Action Required',
    intro: `Hi ${params.memberName}, your payment for ${params.planName} was unsuccessful. Please update your payment method to continue enjoying your membership benefits.`,
    details: [
      `Plan: ${params.planName}`,
      `Grace Period: ${params.gracePeriodDays} days`,
      `Access expires: ${params.gracePeriodEndDate}`,
    ],
    ctaLabel: 'Update Payment Method',
    ctaUrl: updatePaymentUrl,
    footer: `Your membership benefits are still active during the grace period. Update your payment to avoid interruption.`,
  });
}

/**
 * Day 7: Reminder - 7 days left in grace period
 */
export function renderPaymentReminderEmail(params: {
  memberName: string;
  planName: string;
  daysRemaining: number;
  gracePeriodEndDate: string;
}) {
  const updatePaymentUrl = joinUrl(DEFAULT_APP_URL, '/dashboard/membership');
  return buildEmailTemplate({
    title: `⏰ ${params.daysRemaining} Days Left to Update Payment`,
    intro: `Hi ${params.memberName}, this is a reminder that your payment for ${params.planName} is still pending. You have ${params.daysRemaining} days left to update your payment method before losing access.`,
    details: [
      `Plan: ${params.planName}`,
      `Days Remaining: ${params.daysRemaining}`,
      `Access expires: ${params.gracePeriodEndDate}`,
    ],
    ctaLabel: 'Update Payment Now',
    ctaUrl: updatePaymentUrl,
    footer: `Don't lose access to your 24/7 emergency hotline, legal consultations, and other benefits!`,
  });
}

/**
 * Day 13: Final Warning - 1 day left
 */
export function renderPaymentFinalWarningEmail(params: {
  memberName: string;
  planName: string;
  gracePeriodEndDate: string;
}) {
  const updatePaymentUrl = joinUrl(DEFAULT_APP_URL, '/dashboard/membership');
  return buildEmailTemplate({
    title: '🚨 FINAL WARNING: Membership Expires Tomorrow',
    intro: `Hi ${params.memberName}, your grace period for ${params.planName} ends TOMORROW. If payment is not updated, your membership will be suspended and you will lose access to all benefits.`,
    details: [
      `Plan: ${params.planName}`,
      `⚠️ ACCESS EXPIRES: ${params.gracePeriodEndDate}`,
      'Without membership: No emergency hotline, no legal support',
    ],
    ctaLabel: 'UPDATE PAYMENT NOW',
    ctaUrl: updatePaymentUrl,
    footer: `This is your final reminder. After tomorrow, you'll need to re-subscribe to regain access.`,
  });
}

export type { EmailTemplate };
