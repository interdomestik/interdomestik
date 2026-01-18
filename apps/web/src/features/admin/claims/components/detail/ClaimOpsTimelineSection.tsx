/**
 * ClaimOpsTimelineSection — Server Component
 * Fetches timeline entries and renders the Ops UI kit timeline.
 */

import 'server-only';

import { getTranslations } from 'next-intl/server';

import { ClaimOpsTimeline } from './ClaimOpsTimeline';
import { getClaimTimeline, type TimelineViewerRole } from '@/features/claims/timeline';

interface ClaimOpsTimelineSectionProps {
  claimId: string;
  tenantId: string;
  viewerRole: TimelineViewerRole;
  showNotes?: boolean;
}

export async function ClaimOpsTimelineSection({
  claimId,
  tenantId,
  viewerRole,
  showNotes = false,
}: ClaimOpsTimelineSectionProps) {
  const tTimeline = await getTranslations('admin.claims_page.timeline');
  const timeline = await getClaimTimeline({ claimId, tenantId, viewerRole });

  return (
    <ClaimOpsTimeline
      entries={timeline.entries}
      title={tTimeline('title')}
      emptyLabel={tTimeline('empty')}
      showNotes={showNotes && viewerRole !== 'member'}
    />
  );
}
