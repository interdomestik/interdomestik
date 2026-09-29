import { claimEscalationAgreements, eq, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import { getRecoveryDeclineMemberDescription } from './recovery-decision';
import type { ClaimStatus } from './types';

type StatusNoteContext = {
  claimId: string;
  currentStatus: ClaimStatus | null;
  isPublicChange: boolean;
  note?: string;
  tenantId: string;
};

export async function safePublicStatusNote(
  tx: TenantTransaction,
  context: StatusNoteContext
): Promise<string | null> {
  const note = context.note?.trim() || null;
  if (!note || !context.isPublicChange) {
    return note;
  }

  const [decision] = await tx
    .select({
      decisionType: claimEscalationAgreements.decisionType,
      declineReasonCode: claimEscalationAgreements.declineReasonCode,
    })
    .from(claimEscalationAgreements)
    .where(
      withTenant(
        context.tenantId,
        claimEscalationAgreements.tenantId,
        eq(claimEscalationAgreements.claimId, context.claimId)
      )
    )
    .limit(1)
    .for('update');

  if (
    decision?.declineReasonCode === 'conflict_or_integrity_concern' ||
    (decision?.decisionType === 'declined' && !decision.declineReasonCode) ||
    (!decision && context.currentStatus === 'rejected')
  ) {
    return getRecoveryDeclineMemberDescription('conflict_or_integrity_concern');
  }
  return note;
}
