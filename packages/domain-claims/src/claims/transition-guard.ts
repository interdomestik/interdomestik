import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import type { PaymentAuthorizationState } from '../staff-claims/types';
import {
  needsRecoveryInvariantEvidence,
  type RecoveryInvariantRejectionReason,
} from './recovery-invariants';

export type ClaimTransitionActor = {
  id: string;
  role: string | null;
};

export type ClaimTransitionContext = {
  paymentAuthorizationState?: PaymentAuthorizationState | null;
  recoveryInvariantRejection?: RecoveryInvariantRejectionReason | null;
};

// T-002d: module-private brand for the transition proof.
declare const AuthorizedTransitionBrand: unique symbol;

export type AuthorizedTransition = {
  readonly [AuthorizedTransitionBrand]: 'claim-status-transition';
  readonly actorId: string;
  readonly from: ClaimStatus;
  readonly to: ClaimStatus;
};

export type ClaimTransitionDecision =
  | { allowed: true; authorization: AuthorizedTransition }
  | {
      allowed: false;
      reason: 'invalid_status' | 'illegal_transition' | RecoveryInvariantRejectionReason;
    };

const STATUS_SET = new Set<string>(CLAIM_STATUSES);
const PAYMENT_GATED_STATUSES = new Set<ClaimStatus>(['negotiation', 'court']);

export const ALLOWED_CLAIM_STATUS_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['verification', 'evaluation', 'rejected'],
  verification: ['evaluation', 'submitted'],
  evaluation: ['negotiation', 'verification', 'rejected', 'resolved'],
  negotiation: ['court', 'resolved', 'evaluation', 'rejected'],
  court: ['resolved', 'rejected', 'negotiation'],
  resolved: ['evaluation', 'negotiation'],
  rejected: ['evaluation', 'submitted'],
} as const satisfies Record<ClaimStatus, readonly ClaimStatus[]>;

export function isClaimStatus(value: string | null | undefined): value is ClaimStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

export function isClaimStatusTransitionInGraph(from: ClaimStatus, to: ClaimStatus): boolean {
  const allowedTransitions = ALLOWED_CLAIM_STATUS_TRANSITIONS[from] as readonly ClaimStatus[];
  return from === to || allowedTransitions.includes(to);
}

// T-002d: the only legal construction site for the proof.
function mintAuthorizedTransition(
  actorId: string,
  from: ClaimStatus,
  to: ClaimStatus
): AuthorizedTransition {
  return { actorId, from, to } as AuthorizedTransition;
}

export function canTransition(params: {
  actor: ClaimTransitionActor;
  context?: ClaimTransitionContext;
  from: ClaimStatus;
  to: ClaimStatus;
}): ClaimTransitionDecision {
  const { actor, from, to, context } = params;

  if (!isClaimStatus(from) || !isClaimStatus(to)) {
    return { allowed: false, reason: 'invalid_status' };
  }

  if (!isClaimStatusTransitionInGraph(from, to)) {
    return { allowed: false, reason: 'illegal_transition' };
  }

  if (needsRecoveryInvariantEvidence(to) && context?.recoveryInvariantRejection) {
    return { allowed: false, reason: context.recoveryInvariantRejection };
  }

  if (PAYMENT_GATED_STATUSES.has(to) && context?.paymentAuthorizationState !== 'authorized') {
    return { allowed: false, reason: 'signed_agreement_authorization_required' };
  }

  return { allowed: true, authorization: mintAuthorizedTransition(actor.id, from, to) };
}

export const canTransitionClaimStatus = canTransition;
