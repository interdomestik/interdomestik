'use client';

import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TimelineEntry as TimelineEntryType } from '../types';
import { TimelineEntry } from './TimelineEntry';

interface ClaimTimelineProps {
  entries: TimelineEntryType[];
  showNotes?: boolean;
}

export function ClaimTimeline({ entries, showNotes = false }: ClaimTimelineProps) {
  const t = useTranslations('claims.timeline');

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground rounded-lg bg-white/5">
        <Clock className="h-4 w-4" />
        <span>{t('empty')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4 text-emerald-500" />
        {t('title')}
      </h3>

      <div className="relative">
        {entries.map(entry => (
          <TimelineEntry key={entry.id} entry={entry} showNote={showNotes} />
        ))}
      </div>
    </div>
  );
}
