'use client';

import { Clock, User } from 'lucide-react';
import type { OpsTimelineEvent } from './types';

interface OpsTimelineProps {
  title: string;
  events: OpsTimelineEvent[];
  emptyLabel: string;
  formatTimestamp?: (value: string) => string;
}

export function OpsTimeline({ title, events, emptyLabel, formatTimestamp }: OpsTimelineProps) {
  return (
    <div className="space-y-3" data-testid="ops-timeline">
      <h4 className="font-medium flex items-center gap-2">
        <Clock className="w-4 h-4" /> {title}
      </h4>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground italic" data-testid="ops-timeline-empty">
          {emptyLabel}
        </p>
      ) : (
        <div className="border-l-2 border-muted ml-2 space-y-6 pl-4 py-2">
          {events.map(event => (
            <div key={event.id} className="relative" data-testid="ops-timeline-item">
              <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-4 ring-background" />
              <p className="text-sm font-medium">{event.title}</p>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>
                  {formatTimestamp
                    ? formatTimestamp(event.date)
                    : new Date(event.date).toLocaleString()}
                </span>
                {event.actorName && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> {event.actorName}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
