import { getRecoveryDeclineMemberDescription } from './recovery-decision';
import type { ClaimStatus, RecoveryDeclineReasonCode } from './types';

type StatusNoteContext = {
  fromStatus: ClaimStatus;
  isPublic: boolean;
  note: string | null;
};

export type StatusNoteDecision = {
  decisionType: 'accepted' | 'declined' | null;
  declineReasonCode: RecoveryDeclineReasonCode | null;
};

export function safePublicStatusNote(
  context: StatusNoteContext,
  decision: StatusNoteDecision | undefined
): string | null {
  const note = context.note?.trim() || null;
  if (!note || !context.isPublic) return note;

  if (
    decision?.declineReasonCode === 'conflict_or_integrity_concern' ||
    (decision?.decisionType === 'declined' && !decision.declineReasonCode) ||
    (!decision && context.fromStatus === 'rejected')
  ) {
    return getRecoveryDeclineMemberDescription('conflict_or_integrity_concern');
  }
  return note;
}
