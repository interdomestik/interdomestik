import {
  appendEvent,
  claimEscalationAgreements,
  db,
  eq,
  type DomainEventTx,
} from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import type { ClaimsSession } from '../claims/types';
import { buildRecoveryDecisionSnapshot } from './recovery-decision';
import type { RecoveryDecisionSnapshot, SaveRecoveryDecisionInput } from './types';

type DeclineReasonCode = Extract<
  SaveRecoveryDecisionInput,
  { decisionType: 'declined' }
>['declineReasonCode'];
type RecoveryDecisionTransaction = {
  insert: typeof db.insert;
  select: typeof db.select;
  update: typeof db.update;
};

function recoveryDecisionPayload(params: {
  decisionType: SaveRecoveryDecisionInput['decisionType'];
  declineReasonCode?: DeclineReasonCode;
  explanation: string | null;
}) {
  return {
    decisionType: params.decisionType,
    ...(params.decisionType === 'declined' && params.declineReasonCode !== undefined
      ? { declineReasonCode: params.declineReasonCode }
      : {}),
    hasExplanation: Boolean(params.explanation),
  };
}

export async function upsertRecoveryDecisionRecord(params: {
  claimId: string;
  decisionType: SaveRecoveryDecisionInput['decisionType'];
  declineReasonCode?: DeclineReasonCode;
  explanation?: string;
  session: ClaimsSession;
  tenantId: string;
  tx: RecoveryDecisionTransaction;
}): Promise<RecoveryDecisionSnapshot> {
  const now = new Date();
  const explanation = params.explanation?.trim() || null;

  const [existingDecision] = await params.tx
    .select({ id: claimEscalationAgreements.id })
    .from(claimEscalationAgreements)
    .where(
      withTenant(
        params.tenantId,
        claimEscalationAgreements.tenantId,
        eq(claimEscalationAgreements.claimId, params.claimId)
      )
    )
    .limit(1);

  const declineReasonCode: DeclineReasonCode | null =
    params.decisionType === 'declined' ? (params.declineReasonCode ?? null) : null;
  const values = {
    acceptedAt: now,
    acceptedById: params.session.user.id,
    decisionReason: explanation,
    decisionType: params.decisionType,
    declineReasonCode,
    updatedAt: now,
  };

  if (existingDecision) {
    await params.tx
      .update(claimEscalationAgreements)
      .set(values)
      .where(
        withTenant(
          params.tenantId,
          claimEscalationAgreements.tenantId,
          eq(claimEscalationAgreements.claimId, params.claimId)
        )
      );
  } else {
    await params.tx.insert(claimEscalationAgreements).values({
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      claimId: params.claimId,
      createdAt: now,
      ...values,
    });
  }

  await appendEvent(params.tx as DomainEventTx, {
    actor: { id: params.session.user.id, role: params.session.user.role?.trim() || 'staff' },
    aggregateVersion: 0,
    correlationId: `claim:${params.claimId}:recovery-decision:${params.decisionType}`,
    createdAt: now,
    entity: { id: params.claimId, type: 'claim' },
    eventName: 'recovery.decision_recorded',
    eventVersion: 1,
    payload: recoveryDecisionPayload({
      decisionType: params.decisionType,
      declineReasonCode: params.declineReasonCode,
      explanation,
    }),
    tenantId: params.tenantId,
  });

  return buildRecoveryDecisionSnapshot({
    decidedAt: now,
    declineReasonCode,
    decisionType: params.decisionType,
    explanation,
  });
}
