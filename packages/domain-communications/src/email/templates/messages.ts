import { buildEmailTemplate, DEFAULT_APP_URL, joinUrl } from './base';

export function renderNewMessageEmail(params: {
  claimId: string;
  claimTitle: string;
  senderName: string;
  messagePreview: string;
}) {
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/member/claims/${params.claimId}`);
  const preview = params.messagePreview.slice(0, 160);
  return buildEmailTemplate({
    title: 'New message on your claim',
    intro: `${params.senderName} sent a message about "${params.claimTitle}".`,
    details: [preview, `Claim ID: ${params.claimId}`],
    ctaLabel: 'Reply now',
    ctaUrl: claimUrl,
  });
}
