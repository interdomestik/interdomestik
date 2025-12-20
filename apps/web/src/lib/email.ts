import { Resend } from 'resend';
import {
  renderClaimAssignedEmail,
  renderClaimSubmittedEmail,
  renderNewMessageEmail,
  renderStatusChangedEmail,
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

async function sendEmail(to: string, template: { subject: string; html: string; text: string }) {
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
