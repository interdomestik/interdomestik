import type { OpsTimelineEvent } from '@/components/ops/types';
import type { AssignmentTimelineEntry } from '@/features/admin/claims/server/claim-assignment-history';
import type { TimelineEntry } from '@/features/claims/timeline/types';

type Translate = (key: string, values?: Record<string, string>) => string;

export type ClaimOpsTimelineTranslators = Readonly<{
  timeline: Translate;
  status: Translate;
}>;

function statusEvent(
  entry: TimelineEntry,
  t: ClaimOpsTimelineTranslators,
  showNotes: boolean
): OpsTimelineEvent {
  const fromLabel = entry.fromStatus ? t.status(entry.fromStatus) : t.timeline('initial');
  const toLabel = t.status(entry.toStatus);
  return {
    id: entry.id,
    title: `${fromLabel} → ${toLabel}`,
    description: showNotes && entry.note ? entry.note : undefined,
    date: entry.timestamp.toISOString(),
    actorName: t.timeline(`actor_${entry.actorRole}`),
  };
}

function assignmentTitle(entry: AssignmentTimelineEntry, t: Translate): string {
  if (entry.kind === 'unassigned') return t('assignment_removed');
  if (entry.toHandlerName) return t('assignment_assigned', { name: entry.toHandlerName });
  return t('assignment_assigned_unnamed');
}

function assignmentEvent(entry: AssignmentTimelineEntry, t: Translate): OpsTimelineEvent {
  return {
    id: entry.id,
    title: assignmentTitle(entry, t),
    description: entry.fromHandlerName
      ? t('assignment_previous', { name: entry.fromHandlerName })
      : undefined,
    date: entry.timestamp.toISOString(),
    actorName: entry.actorName ?? t(`actor_${entry.actorRole}`),
  };
}

/**
 * Merges assignment events into the status history by time. Status entries keep their own order
 * and come first on equal timestamps; assignment events never alter a status entry.
 */
export function buildClaimOpsTimelineEvents(
  entries: readonly TimelineEntry[],
  assignments: readonly AssignmentTimelineEntry[],
  t: ClaimOpsTimelineTranslators,
  showNotes: boolean
): OpsTimelineEvent[] {
  const events: OpsTimelineEvent[] = [];
  let next = 0;
  for (const entry of entries) {
    while (
      next < assignments.length &&
      assignments[next].timestamp.getTime() < entry.timestamp.getTime()
    ) {
      events.push(assignmentEvent(assignments[next], t.timeline));
      next += 1;
    }
    events.push(statusEvent(entry, t, showNotes));
  }
  for (const assignment of assignments.slice(next)) {
    events.push(assignmentEvent(assignment, t.timeline));
  }
  return events;
}
