/**
 * ClaimOpsTimelineSection — Server Component
 * Fetches timeline entries and renders the Ops UI kit timeline.
 */

import 'server-only';

import { getNoteFreeClaimTimeline } from '@/features/claims/communication/get-note-free-claim-timeline';
import { RestrictedClaimTimeline } from '@/features/claims/communication/restricted-claim-timeline';
import { getClaimAssignmentHistory } from '@/features/admin/claims/server/get-claim-assignment-history';
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

function showsAssignmentHistory(viewerRole: TimelineViewerRole): boolean {
  return viewerRole === 'admin' || viewerRole === 'staff';
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
  // Assignment history is internal: only admin/staff presentations request it, and the read itself
  // admits only the admin family. It fails closed to no entries, never to a broken status history.
  // Sequential on purpose: one tenant transaction at a time per request connection.
  const assignments = showsAssignmentHistory(viewerRole)
    ? await getClaimAssignmentHistory({ claimId, authority })
    : [];

  return (
    <ClaimOpsTimeline
      entries={timeline.entries}
      assignments={assignments}
      title={tTimeline('title')}
      emptyLabel={tTimeline('empty')}
      showNotes={showNotes && viewerRole !== 'member'}
    />
  );
}
