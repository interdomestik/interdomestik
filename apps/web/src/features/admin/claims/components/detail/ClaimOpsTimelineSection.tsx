/**
 * ClaimOpsTimelineSection — Server Component
 * Fetches timeline entries and renders the Ops UI kit timeline.
 */

import 'server-only';

import { getNoteFreeClaimTimeline } from '@/features/claims/communication/get-note-free-claim-timeline';
import { RestrictedClaimTimeline } from '@/features/claims/communication/restricted-claim-timeline';
import { getClaimTimeline, type TimelineViewerRole } from '@/features/claims/timeline';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { getTranslations } from 'next-intl/server';
import { ClaimOpsTimeline } from './ClaimOpsTimeline';

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
  if (deniesClaimMessageContent(readTenantAuthority(authority).principal?.role)) {
    const result = await getNoteFreeClaimTimeline({ claimId, authority });
    return <RestrictedClaimTimeline result={result} />;
  }
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
