import { appendEvent, type DomainEventTx } from '@interdomestik/database';

import type { ClaimsSession } from '../claims/types';
import type {
  ClaimEscalationAgreementSnapshot,
  EscalationDecisionNextStatus,
  PaymentAuthorizationState,
} from './types';

type DateLike = Date | string | null | undefined;

function normalizeDate(value: DateLike) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildEscalationAgreementPayload(params: {
  decisionNextStatus: EscalationDecisionNextStatus;
  decisionReason: string | null;
  feePercentage: number;
  legalActionCapPercentage: number;
  minimumFee: string;
  paymentAuthorizationState: PaymentAuthorizationState;
}) {
  return {
    decisionNextStatus: params.decisionNextStatus,
    feePercentage: params.feePercentage,
    hasDecisionReason: Boolean(params.decisionReason),
    hasLegalActionCap: params.legalActionCapPercentage > 0,
    hasMinimumFee: params.minimumFee.trim().length > 0,
    paymentAuthorizationState: params.paymentAuthorizationState,
  };
}

export function buildEscalationAgreementSnapshot(params: {
  acceptedAt: DateLike;
  claimId: string;
  decisionNextStatus: ClaimEscalationAgreementSnapshot['decisionNextStatus'];
  decisionReason: string | null;
  feePercentage: number;
  legalActionCapPercentage: number;
  minimumFee: string;
  paymentAuthorizationState: ClaimEscalationAgreementSnapshot['paymentAuthorizationState'];
  signedAt: DateLike;
  termsVersion: string;
}): ClaimEscalationAgreementSnapshot {
  return {
    acceptedAt: normalizeDate(params.acceptedAt),
    claimId: params.claimId,
    decisionNextStatus: params.decisionNextStatus,
    decisionReason: params.decisionReason,
    feePercentage: params.feePercentage,
    legalActionCapPercentage: params.legalActionCapPercentage,
    minimumFee: params.minimumFee,
    paymentAuthorizationState: params.paymentAuthorizationState,
    signedAt: normalizeDate(params.signedAt),
    termsVersion: params.termsVersion,
  };
}

export async function recordEscalationAgreementEvent(params: {
  claimId: string;
  decisionNextStatus: EscalationDecisionNextStatus;
  decisionReason: string | null;
  feePercentage: number;
  legalActionCapPercentage: number;
  minimumFee: string;
  now: Date;
  paymentAuthorizationState: PaymentAuthorizationState;
  session: ClaimsSession;
  tenantId: string;
  tx: DomainEventTx;
}) {
  await appendEvent(params.tx, {
    actor: { id: params.session.user.id, role: params.session.user.role?.trim() || 'staff' },
    aggregateVersion: 0,
    correlationId: `claim:${params.claimId}:recovery-escalation-agreement:${params.decisionNextStatus}`,
    createdAt: params.now,
    entity: { id: params.claimId, type: 'claim' },
    eventName: 'recovery.escalation_agreement_recorded',
    eventVersion: 1,
    payload: buildEscalationAgreementPayload(params),
    tenantId: params.tenantId,
  });
}
