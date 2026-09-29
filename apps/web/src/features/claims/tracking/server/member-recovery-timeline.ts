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
  const currentDecisionCanExposeNotes = ordinaryDecline || decision?.decisionType === 'accepted';

  // A current decision cannot classify older notes. Sensitive decisions hide all free-text history.
  return timeline.map(event => {
    if (event.note === null) return event;
    if (currentDecisionCanExposeNotes && decision?.acceptedAt && event.date > decision.acceptedAt) {
      return event;
    }
    if (!decision && event.statusTo !== 'rejected') return event;
    return {
      ...event,
      note:
        event.statusTo === 'rejected'
          ? getRecoveryDeclineMemberDescription('conflict_or_integrity_concern')
          : null,
    };
  });
}
