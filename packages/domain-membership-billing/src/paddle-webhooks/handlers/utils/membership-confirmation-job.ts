import { RetryablePaddleWebhookError } from '../../errors';
import type {
  MembershipConfirmationClaim,
  MembershipConfirmationDeliveryStore,
  MembershipConfirmationSnapshot,
  SendThankYouLetter,
} from '../../types';

export function assertMembershipConfirmationClaimSettled(
  claim: { kind: string },
  providerReference: string
): void {
  if (claim.kind === 'in_progress') {
    throw new RetryablePaddleWebhookError(
      `Membership confirmation claim is in progress for subscription ${providerReference}`
    );
  }
}

export type MembershipConfirmationJob = {
  deliveryId: string;
  idempotencyKey: string;
  requiresEffects: boolean;
  send: SendThankYouLetter;
  snapshot: MembershipConfirmationSnapshot;
  store: MembershipConfirmationDeliveryStore;
};

export function toMembershipConfirmationJob(args: {
  claim: Extract<MembershipConfirmationClaim, { kind: 'claimed' }>;
  idempotencyKey: string;
  send: SendThankYouLetter;
  store: MembershipConfirmationDeliveryStore;
}): MembershipConfirmationJob {
  return {
    deliveryId: args.claim.deliveryId,
    idempotencyKey: args.idempotencyKey,
    requiresEffects: args.claim.requiresEffects,
    send: args.send,
    snapshot: args.claim.snapshot,
    store: args.store,
  };
}
