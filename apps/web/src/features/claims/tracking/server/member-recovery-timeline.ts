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
  decisionRecordedAt: Date | null;
  decisionType: string | null;
  declineReasonCode: string | null;
};

export type RecoveryDecisionEvidenceRow = {
  decisionType: string | null;
  declineReasonCode: string | null;
  decisionEventAt: Date | null;
  decisionEventPayload: Record<string, unknown> | null;
};

export function verifiedRecoveryDecisionAt(rows: RecoveryDecisionEvidenceRow[]): Date | null {
  const latest = rows[0];
  const eventAt = latest?.decisionEventAt;
  const payload = latest?.decisionEventPayload;
  if (!eventAt || Number.isNaN(eventAt.getTime()) || !payload) return null;

  // Timestamp ties cannot establish which decision was last.
  if (rows[1]?.decisionEventAt?.getTime() === eventAt.getTime()) return null;
  if (payload.decisionType !== latest.decisionType) return null;
  const eventReason = payload.declineReasonCode ?? null;
  if (eventReason !== latest.declineReasonCode) return null;
  return eventAt;
}

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
    if (
      currentDecisionCanExposeNotes &&
      decision?.decisionRecordedAt &&
      event.date > decision.decisionRecordedAt
    ) {
      return event;
    }
    if (!decision?.decisionType && event.statusTo !== 'rejected') return event;
    return {
      ...event,
      note:
        event.statusTo === 'rejected'
          ? getRecoveryDeclineMemberDescription('conflict_or_integrity_concern')
          : null,
    };
  });
}
