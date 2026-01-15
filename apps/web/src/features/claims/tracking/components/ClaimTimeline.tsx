'use client';

import { cn } from '@interdomestik/ui/lib/utils';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import type { ClaimTimelineEvent } from '../types';

interface ClaimTimelineProps {
  events: ClaimTimelineEvent[];
  className?: string;
}

export function ClaimTimeline({ events, className }: ClaimTimelineProps) {
  const t = useTranslations('claims-tracking.tracking.timeline');
  const tStatus = useTranslations('claims-tracking.status');

  return (
    <div
      className={cn('space-y-8 relative pl-4 border-l-2 border-muted', className)}
      data-testid="claim-timeline"
    >
      {!events.length ? <div className="text-sm text-muted-foreground">{t('empty')}</div> : null}
      {events.map(event => (
        <div key={event.id} className="relative">
          <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-primary border-2 border-background" />
          <div className="flex flex-col space-y-1">
            <span className="text-xs text-muted-foreground">
              {format(new Date(event.date), 'PPP p')}
            </span>
            <h4 className="font-semibold text-sm">{tStatus(`${event.statusTo}`)}</h4>
            {event.note && (
              <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">{event.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
