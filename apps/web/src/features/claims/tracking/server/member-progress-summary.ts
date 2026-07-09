import type { ClaimTimelineEvent, ClaimProgressSummaryDto } from '../types';
import type { ClaimStatus } from '@interdomestik/database/constants';

export function buildProgressSummary(args: {
  status: ClaimStatus;
  timeline: ClaimTimelineEvent[];
}): ClaimProgressSummaryDto {
  const currentStatusLabelKey = `claims-tracking.status.${args.status}`;
  const latestUpdate = args.timeline[0];

  if (!latestUpdate) {
    throw new Error('buildProgressSummary requires a non-empty timeline');
  }

  return {
    currentStatusLabelKey,
    latestUpdateAt: latestUpdate.date,
    latestUpdateLabelKey: latestUpdate.labelKey,
    latestUpdateNote: latestUpdate.note,
    nextStepKey: `claims-tracking.status.next_step.${args.status}`,
  };
}
