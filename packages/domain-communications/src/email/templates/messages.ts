import type { EmailTemplate } from './types';
import { buildEmailTemplate, getAppUrl, joinUrl } from './base';

export function renderNewMessageEmail(params: {
  claimId: string;
  claimTitle: string;
  senderName: string;
  messagePreview: string;
}): EmailTemplate {
  const claimUrl = joinUrl(getAppUrl(), `/member/claims/${params.claimId}`);
  const preview = params.messagePreview.slice(0, 160);
  return buildEmailTemplate({
    title: 'New message on your claim',
    intro: `${params.senderName} sent a message about "${params.claimTitle}".`,
    details: [preview, `Claim ID: ${params.claimId}`],
    ctaLabel: 'Reply now',
    ctaUrl: claimUrl,
  });
}
