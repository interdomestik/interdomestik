import { type ClaimStatus } from '@interdomestik/database/constants';

import { buildEmailTemplate, DEFAULT_APP_URL, joinUrl } from './base';

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  verification: 'Verification',
  evaluation: 'Evaluation',
  negotiation: 'Negotiation',
  court: 'Court',
  resolved: 'Resolved',
  rejected: 'Rejected',
} satisfies Record<ClaimStatus, string>;

function formatStatusLabel(status: string) {
  return STATUS_LABELS[status as ClaimStatus] || status;
}

export function renderClaimSubmittedEmail(params: {
  claimId: string;
  claimTitle: string;
  category: string;
}) {
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/member/claims/${params.claimId}`);
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
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/member/claims/${params.claimId}`);
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
  const claimUrl = joinUrl(DEFAULT_APP_URL, `/member/claims/${params.claimId}`);
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
