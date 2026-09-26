import type {
  MembershipConfirmationClaim,
  MembershipConfirmationDeliveryStore,
  MembershipConfirmationSnapshot,
  SendThankYouLetter,
} from '../../types';

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
