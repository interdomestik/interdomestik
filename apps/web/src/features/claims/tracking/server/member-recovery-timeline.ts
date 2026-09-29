import { getRecoveryDeclineMemberDescription } from '@interdomestik/domain-claims';
import type { ClaimTimelineEvent } from '../types';

const ORDINARY_DECLINE_CODES: ReadonlySet<string> = new Set([
  'guidance_only_scope',
  'insufficient_evidence',
  'no_monetary_recovery_path',
  'counterparty_unidentified',
  'time_limit_risk',
]);

type RecoveryDecisionRow = {
  acceptedAt: Date | null;
  decisionType: string | null;
  declineReasonCode: string | null;
};

export function sanitizeMemberRecoveryTimeline(
  timeline: ClaimTimelineEvent[],
  decision: RecoveryDecisionRow | null
): ClaimTimelineEvent[] {
  const ordinaryDecline =
    decision?.decisionType === 'declined' &&
    decision.declineReasonCode !== null &&
    ORDINARY_DECLINE_CODES.has(decision.declineReasonCode);

  // The decision row can be overwritten; an older rejection cannot inherit its current reason.
  return timeline.map(event =>
    event.statusTo === 'rejected' &&
    event.note !== null &&
    !(ordinaryDecline && decision?.acceptedAt && event.date >= decision.acceptedAt)
      ? {
          ...event,
          note: getRecoveryDeclineMemberDescription('conflict_or_integrity_concern'),
        }
      : event
  );
}
