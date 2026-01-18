'use client';

import { Clock, User } from 'lucide-react';
import { OpsEmptyState } from './OpsEmptyState';
import { OPS_TEST_IDS } from './testids';
import type { OpsTimelineEvent } from './types';

interface OpsTimelineProps {
  title: string;
  events: OpsTimelineEvent[];
  emptyLabel: string;
  emptySubtitle?: string;
  formatTimestamp?: (value: string) => string;
}

export function OpsTimeline({
  title,
  events,
  emptyLabel,
  emptySubtitle,
  formatTimestamp,
}: OpsTimelineProps) {
  return (
    <div className="space-y-3" data-testid={OPS_TEST_IDS.TIMELINE.ROOT}>
      <h4 className="font-medium flex items-center gap-2">
        <Clock className="w-4 h-4" /> {title}
      </h4>
      {events.length === 0 ? (
        <OpsEmptyState
          title={emptyLabel}
          subtitle={emptySubtitle}
          className="py-6 bg-muted/10 rounded-lg border border-dashed"
          testId={OPS_TEST_IDS.TIMELINE.EMPTY}
        />
      ) : (
        <div className="border-l-2 border-muted ml-2 space-y-6 pl-4 py-2">
          {events.map(event => (
            <div key={event.id} className="relative" data-testid={OPS_TEST_IDS.TIMELINE.ITEM}>
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

export function toOpsTimelineEvents(events: any[]): OpsTimelineEvent[] {
  if (!Array.isArray(events)) return [];
  return events.map(e => ({
    id: e.id,
    title: e.title || e.action || 'Event',
    description: e.description || e.note,
    date: e.createdAt || e.date,
    actorName: e.actorName || e.performedBy,
  }));
}
