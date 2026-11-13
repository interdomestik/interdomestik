'use client';

import { useLocale, useTranslations } from 'next-intl';

import { OpsTimeline } from '@/components/ops';
import {
  ASSIGNMENT_HISTORY_LIMIT,
  type AssignmentTimelineEntry,
} from '@/features/admin/claims/server/claim-assignment-history';
import type { TimelineEntry } from '@/features/claims/timeline/types';
import { formatPilotDateTime } from '@/lib/utils/date';

import { buildClaimOpsTimelineEvents } from './claim-ops-timeline-events';

interface ClaimOpsTimelineProps {
  entries: TimelineEntry[];
  assignments?: readonly AssignmentTimelineEntry[];
  /** True when only the most recent ASSIGNMENT_HISTORY_LIMIT assignment events are shown. */
  assignmentsTruncated?: boolean;
  title: string;
  emptyLabel: string;
  showNotes?: boolean;
}

export function ClaimOpsTimeline({
  entries,
  assignments = [],
  assignmentsTruncated = false,
  title,
  emptyLabel,
  showNotes = false,
}: ClaimOpsTimelineProps) {
  const locale = useLocale();
  const t = useTranslations('claims.timeline');
  const tStatus = useTranslations('claims.status');

  const events = buildClaimOpsTimelineEvents(
    entries,
    assignments,
    { timeline: t, status: tStatus },
    showNotes
  );

  return (
    <>
      <OpsTimeline
        title={title}
        events={events}
        emptyLabel={emptyLabel}
        formatTimestamp={value => formatPilotDateTime(value, locale, value)}
      />
      {assignmentsTruncated && (
        <p
          className="mt-3 text-xs text-muted-foreground"
          data-testid="claim-timeline-assignments-truncated"
        >
          {t('assignment_truncated', { count: ASSIGNMENT_HISTORY_LIMIT })}
        </p>
      )}
    </>
  );
}
