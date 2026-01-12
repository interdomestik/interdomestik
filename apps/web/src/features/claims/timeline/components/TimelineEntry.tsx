'use client';

import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';

import type { TimelineEntry as TimelineEntryType } from '../types';

interface TimelineEntryProps {
  entry: TimelineEntryType;
  showNote?: boolean;
}

export function TimelineEntry({ entry, showNote = false }: TimelineEntryProps) {
  const t = useTranslations('claims.timeline');
  const tStatus = useTranslations('claims.status');

  const fromLabel = entry.fromStatus ? tStatus(entry.fromStatus) : t('initial');
  const toLabel = tStatus(entry.toStatus);
  const timeAgo = formatDistanceToNow(entry.timestamp, { addSuffix: true });

  return (
    <div className="relative pl-6 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-2 top-2 bottom-0 w-px bg-white/10 last:hidden" />

      {/* Timeline dot */}
      <div className="absolute left-0 top-1 w-4 h-4 rounded-full bg-emerald-500/20 border-2 border-emerald-500" />

      {/* Content */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">
            {fromLabel} → {toLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t(`actor_${entry.actorRole}`)}</span>
          <span>•</span>
          <time dateTime={entry.timestamp.toISOString()}>{timeAgo}</time>
        </div>

        {showNote && entry.note && (
          <p className="text-xs text-muted-foreground mt-1 p-2 rounded bg-white/5">{entry.note}</p>
        )}
      </div>
    </div>
  );
}
