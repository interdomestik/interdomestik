/**
 * ClaimOpsTimelineSection — Server Component
 * Fetches timeline entries and renders the Ops UI kit timeline.
 */

import 'server-only';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { getTranslations } from 'next-intl/server';

import { ClaimOpsTimeline } from './ClaimOpsTimeline';
import { getClaimTimeline, type TimelineViewerRole } from '@/features/claims/timeline';

interface ClaimOpsTimelineSectionProps {
  locale: string;
  claimId: string;
  authority: TenantAuthority;
  viewerRole: TimelineViewerRole;
  showNotes?: boolean;
}

export async function ClaimOpsTimelineSection({
  claimId,
  authority,
  locale,
  viewerRole,
  showNotes = false,
}: ClaimOpsTimelineSectionProps): Promise<React.JSX.Element> {
  const tTimeline = await getTranslations({ locale, namespace: 'admin.claims_page.timeline' });
  const timeline = await getClaimTimeline({ claimId, authority, viewerRole });

  return (
    <ClaimOpsTimeline
      entries={timeline.entries}
      title={tTimeline('title')}
      emptyLabel={tTimeline('empty')}
      showNotes={showNotes && viewerRole !== 'member'}
    />
  );
}
