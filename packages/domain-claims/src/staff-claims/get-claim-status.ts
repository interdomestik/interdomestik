import type { ClaimTimelineEvent } from './get-claim-timeline';

export type ClaimStatusProjection = {
  status: string;
  lastTransitionAt: string | null;
};

export function getClaimStatus(events: ClaimTimelineEvent[]): ClaimStatusProjection {
  const statusEvents = events.filter(event => event.type === 'status_changed');

  if (statusEvents.length === 0) {
    return {
      status: 'draft',
      lastTransitionAt: null,
    };
  }

  const latest = statusEvents[0];

  return {
    status: latest.toStatus ?? latest.fromStatus ?? 'draft',
    lastTransitionAt: latest.createdAt,
  };
}
