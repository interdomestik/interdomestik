import {
  and,
  claimEscalationAgreements,
  eq,
  type TenantTransaction,
} from '@interdomestik/database';

import { getRecoveryDeclineMemberDescription } from './recovery-decision';
import type { ClaimStatus } from './types';

type StatusNoteContext = {
  claimId: string;
  fromStatus: ClaimStatus;
  isPublic: boolean;
  note: string | null;
  tenantId: string;
};

export async function safePublicStatusNote(
  tx: TenantTransaction,
  context: StatusNoteContext
): Promise<string | null> {
  const note = context.note?.trim() || null;
  if (!note || !context.isPublic) {
    return note;
  }

  const [decision] = await tx
    .select({
      decisionType: claimEscalationAgreements.decisionType,
      declineReasonCode: claimEscalationAgreements.declineReasonCode,
    })
    .from(claimEscalationAgreements)
    .where(
      and(
        eq(claimEscalationAgreements.tenantId, context.tenantId),
        eq(claimEscalationAgreements.claimId, context.claimId)
      )
    )
    .for('update')
    .limit(1);

  if (
    decision?.declineReasonCode === 'conflict_or_integrity_concern' ||
    (decision?.decisionType === 'declined' && !decision.declineReasonCode) ||
    (!decision && context.fromStatus === 'rejected')
  ) {
    return getRecoveryDeclineMemberDescription('conflict_or_integrity_concern');
  }
  return note;
}
