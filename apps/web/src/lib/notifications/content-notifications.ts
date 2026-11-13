import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { sendNotification } from '@interdomestik/domain-communications/notifications';
import { sendEmail, sendNewMessageEmail, sendPaymentVerificationEmail } from '@/lib/email';
import {
  buildEmailTemplate,
  getAppUrl,
  joinUrl,
} from '@interdomestik/domain-communications/email/templates';
import { resolveRecipientPreview } from './recipient-preview';
import { schedulePreviewDelivery } from './deferred-preview';

type Options = { authority: TenantAuthority };
type Claim = { id: string; title: string };

export async function notifyNewMessage(
  recipientId: string,
  _recipientEmail: string,
  claim: Claim,
  senderName: string,
  messagePreview: string,
  { authority }: Options
) {
  const preview = await resolveRecipientPreview(authority, recipientId, 'new_message');
  if (!preview) return { success: false };
  const result = await sendNotification(
    recipientId,
    'new_message',
    {
      claimId: claim.id,
      claimTitle: preview.copy?.title ?? claim.title,
      senderName: preview.copy?.title ?? senderName,
      messagePreview: (preview.copy?.content ?? messagePreview).substring(0, 100),
    },
    {
      title: preview.copy?.title ?? 'New Message',
      actionUrl: `/dashboard/claims/${claim.id}`,
      authority,
    }
  );
  if (result.success)
    schedulePreviewDelivery({
      authority,
      recipientId,
      event: 'new_message',
      email: (to, { copy }) =>
        sendNewMessageEmail(
          to,
          copy ? { id: claim.id, title: copy.title } : claim,
          copy?.title ?? senderName,
          copy?.content ?? messagePreview
        ),
      push: { claimId: claim.id, senderName, message: messagePreview },
    });
  return result;
}

export async function notifyPaymentVerificationUpdate(
  recipientId: string,
  _recipientEmail: string,
  props: {
    leadName: string;
    amount: number;
    currency: string;
    status: 'needs_info' | 'rejected';
    note?: string;
    link: string;
  },
  { authority }: Options
) {
  const preview = await resolveRecipientPreview(
    authority,
    recipientId,
    'payment_verification_update'
  );
  if (!preview) return { success: false };
  const result = await sendNotification(
    recipientId,
    'payment_verification_update',
    {
      leadName: props.leadName,
      status: props.status,
      note: preview.copy?.content ?? props.note ?? '',
    },
    {
      title:
        preview.copy?.title ??
        `Payment ${props.status === 'needs_info' ? 'Needs Info' : 'Rejected'}`,
      actionUrl: props.link,
      authority,
    }
  );
  if (result.success)
    schedulePreviewDelivery({
      authority,
      recipientId,
      event: 'payment_verification_update',
      email: (to, { copy }) =>
        sendPaymentVerificationEmail(to, copy ? { ...props, note: copy.content } : props),
    });
  return result;
}

export async function notifyDocumentRequested(
  recipientId: string,
  _recipientEmail: string,
  claim: Claim,
  requestSummary: string,
  { authority }: Options
) {
  const preview = await resolveRecipientPreview(authority, recipientId, 'document_requested');
  if (!preview) return { success: false };
  const actionUrl = `/member/claims/${claim.id}`;
  const result = await sendNotification(
    recipientId,
    'document_requested',
    {
      claimId: claim.id,
      claimTitle: preview.copy?.title ?? claim.title,
      requestSummary: preview.copy?.content ?? requestSummary,
    },
    { title: preview.copy?.title ?? 'Documents requested', actionUrl, authority }
  );
  if (result.success)
    schedulePreviewDelivery({
      authority,
      recipientId,
      event: 'document_requested',
      // Retain the existing lifecycle template and full-content copy for other recipients.
      email: (to, { copy }) =>
        sendEmail(
          to,
          buildEmailTemplate({
            title: copy?.title ?? 'Documents requested',
            intro: copy?.content ?? `Staff requested more documents for ${claim.title}.`,
            details: copy ? undefined : [requestSummary],
            ctaLabel: copy?.title ?? 'Open claim',
            ctaUrl: joinUrl(getAppUrl(), actionUrl),
          })
        ),
    });
  return result;
}
