/**
 * ClaimTimelineSection — Server Component
 * v2.1 — Phase 2.4 Timeline Embedding
 *
 * Fetches and renders claim timeline with role-based visibility filtering.
 * Used in admin/member/agent claim detail pages.
 */

import 'server-only';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { getClaimTimeline, type TimelineViewerRole } from '@/features/claims/timeline';
import { ClaimTimeline } from '@/features/claims/timeline/components';

interface ClaimTimelineSectionProps {
  claimId: string;
  authority: TenantAuthority;
  viewerRole: TimelineViewerRole;
  showNotes?: boolean;
}

export async function ClaimTimelineSection({
  claimId,
  authority,
  viewerRole,
  showNotes = false,
}: ClaimTimelineSectionProps) {
  const timeline = await getClaimTimeline({
    claimId,
    authority,
    viewerRole,
  });

  return (
    <ClaimTimeline entries={timeline.entries} showNotes={showNotes && viewerRole !== 'member'} />
  );
}
