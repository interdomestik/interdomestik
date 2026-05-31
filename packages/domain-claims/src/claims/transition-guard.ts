import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import type { PaymentAuthorizationState } from '../staff-claims/types';

export type ClaimTransitionActor = {
  id: string;
  role: string | null;
};

export type ClaimTransitionContext = {
  paymentAuthorizationState?: PaymentAuthorizationState | null;
};

export type ClaimTransitionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'payment_authorization_required' | 'invalid_status' };

const STATUS_SET = new Set<string>(CLAIM_STATUSES);
const PAYMENT_GATED_STATUSES = new Set<ClaimStatus>(['negotiation', 'court']);

export function isClaimStatus(value: string | null | undefined): value is ClaimStatus {
  return typeof value === 'string' && STATUS_SET.has(value);
}

export function canTransition(params: {
  actor: ClaimTransitionActor;
  context?: ClaimTransitionContext;
  from: ClaimStatus;
  to: ClaimStatus;
}): ClaimTransitionDecision {
  const { from, to, context } = params;

  if (!isClaimStatus(from) || !isClaimStatus(to)) {
    return { allowed: false, reason: 'invalid_status' };
  }

  if (PAYMENT_GATED_STATUSES.has(to) && context?.paymentAuthorizationState !== 'authorized') {
    return { allowed: false, reason: 'payment_authorization_required' };
  }

  return { allowed: true };
}

export const canTransitionClaimStatus = canTransition;
