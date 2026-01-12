/**
 * ClaimTimelineSection — Server Component
 * v2.1 — Phase 2.4 Timeline Embedding
 *
 * Fetches and renders claim timeline with role-based visibility filtering.
 * Used in admin/member/agent claim detail pages.
 */

import 'server-only';

import { getClaimTimeline, type TimelineViewerRole } from '@/features/claims/timeline';
import { ClaimTimeline } from '@/features/claims/timeline/components';

interface ClaimTimelineSectionProps {
  claimId: string;
  tenantId: string;
  viewerRole: TimelineViewerRole;
  showNotes?: boolean;
}

export async function ClaimTimelineSection({
  claimId,
  tenantId,
  viewerRole,
  showNotes = false,
}: ClaimTimelineSectionProps) {
  const timeline = await getClaimTimeline({
    claimId,
    tenantId,
    viewerRole,
  });

  return (
    <ClaimTimeline entries={timeline.entries} showNotes={showNotes && viewerRole !== 'member'} />
  );
}
