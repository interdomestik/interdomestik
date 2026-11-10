/**
 * ClaimTimelineSection — Server Component
 * v2.1 — Phase 2.4 Timeline Embedding
 *
 * Fetches and renders claim timeline with role-based visibility filtering.
 * Used in admin/member/agent claim detail pages.
 */

import 'server-only';

import { getNoteFreeClaimTimeline } from '@/features/claims/communication/get-note-free-claim-timeline';
import { RestrictedClaimTimeline } from '@/features/claims/communication/restricted-claim-timeline';
import { getClaimTimeline, type TimelineViewerRole } from '@/features/claims/timeline';
import { ClaimTimeline } from '@/features/claims/timeline/components';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

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
  if (deniesClaimMessageContent(readTenantAuthority(authority).principal?.role)) {
    const result = await getNoteFreeClaimTimeline({ claimId, authority });
    return <RestrictedClaimTimeline result={result} />;
  }
  const timeline = await getClaimTimeline({
    claimId,
    authority,
    viewerRole,
  });

  return (
    <ClaimTimeline entries={timeline.entries} showNotes={showNotes && viewerRole !== 'member'} />
  );
}
