import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

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
  authority: TenantAuthority;
  deliveryId: string;
  idempotencyKey: string;
  requiresEffects: boolean;
  send: SendThankYouLetter;
  snapshot: MembershipConfirmationSnapshot;
  store: MembershipConfirmationDeliveryStore;
};

export function toMembershipConfirmationJob(args: {
  authority: TenantAuthority;
  claim: Extract<MembershipConfirmationClaim, { kind: 'claimed' }>;
  idempotencyKey: string;
  send: SendThankYouLetter;
  store: MembershipConfirmationDeliveryStore;
}): MembershipConfirmationJob {
  // A claimed snapshot for another tenant is never delivered under this authority.
  const authorityTenantId = readTenantAuthority(args.authority).tenantId;
  if (args.claim.snapshot.tenantId !== authorityTenantId) {
    throw new Error(
      `Membership confirmation tenant conflict: snapshot=${args.claim.snapshot.tenantId} authority=${authorityTenantId}`
    );
  }
  return {
    authority: args.authority,
    deliveryId: args.claim.deliveryId,
    idempotencyKey: args.idempotencyKey,
    requiresEffects: args.claim.requiresEffects,
    send: args.send,
    snapshot: args.claim.snapshot,
    store: args.store,
  };
}
