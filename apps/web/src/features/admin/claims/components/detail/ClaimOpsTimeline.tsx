'use client';

import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';

import { OpsTimeline } from '@/components/ops';
import type { TimelineEntry } from '@/features/claims/timeline/types';

interface ClaimOpsTimelineProps {
  entries: TimelineEntry[];
  title: string;
  emptyLabel: string;
  showNotes?: boolean;
}

export function ClaimOpsTimeline({
  entries,
  title,
  emptyLabel,
  showNotes = false,
}: ClaimOpsTimelineProps) {
  const t = useTranslations('claims.timeline');
  const tStatus = useTranslations('claims.status');

  const events = entries.map(entry => {
    const fromLabel = entry.fromStatus ? tStatus(entry.fromStatus) : t('initial');
    const toLabel = tStatus(entry.toStatus);
    return {
      id: entry.id,
      title: `${fromLabel} → ${toLabel}`,
      description: showNotes && entry.note ? entry.note : undefined,
      date: entry.timestamp.toISOString(),
      actorName: t(`actor_${entry.actorRole}`),
    };
  });

  return (
    <OpsTimeline
      title={title}
      events={events}
      emptyLabel={emptyLabel}
      formatTimestamp={value => formatDistanceToNow(new Date(value), { addSuffix: true })}
    />
  );
}
