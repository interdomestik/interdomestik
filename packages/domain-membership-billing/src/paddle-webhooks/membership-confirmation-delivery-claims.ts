import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { z } from 'zod';
import type {
  MembershipConfirmationClaim,
  MembershipConfirmationEvidence,
  MembershipConfirmationRetryEvidence,
  MembershipConfirmationSnapshot,
} from './types';
import type {
  StoredDeliveryRow,
  MembershipConfirmationDeliveryRepository,
} from './membership-confirmation-delivery';

/** A claim, snapshot or evidence for another tenant than the delivery's authority is never served. */
export function assertAuthorityTenant(authority: TenantAuthority, tenantId: string): void {
  const authorityTenantId = readTenantAuthority(authority).tenantId;
  if (authorityTenantId !== tenantId) {
    throw new Error(
      `Membership confirmation tenant conflict: delivery=${tenantId} authority=${authorityTenantId}`
    );
  }
}

export const snapshotSchema = z.object({
  email: z.string().min(1),
  memberName: z.string().min(1),
  memberNumber: z.string().min(1),
  planName: z.string().min(1),
  planPrice: z.string().min(1),
  planInterval: z.string().min(1),
  memberSince: z.string().datetime(),
  expiresAt: z.string().datetime(),
  locale: z.enum(['en', 'sq', 'mk', 'sr', 'de']),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  subscriptionId: z.string().min(1),
  providerReference: z.string().min(1),
  providerEventId: z.string().min(1),
  webhookPayloadHash: z.string().min(1),
  providerStatus: z.literal('active'),
  eventType: z.literal('subscription.created'),
  emailRequest: z.object({
    to: z.string().min(1),
    subject: z.string().min(1),
    html: z.string().min(1),
    text: z.string().min(1),
    source: z.unknown().optional(),
  }),
});

export const metadataSchema = z.object({
  kind: z.literal('membership_confirmation'),
  version: z.literal(1),
  snapshot: snapshotSchema,
});

export function sameProviderEvidence(
  stored: MembershipConfirmationSnapshot,
  proposed: MembershipConfirmationEvidence
) {
  return (
    stored.tenantId === proposed.tenantId &&
    stored.userId === proposed.userId &&
    stored.subscriptionId === proposed.subscriptionId &&
    stored.providerReference === proposed.providerReference &&
    stored.providerEventId === proposed.providerEventId &&
    stored.webhookPayloadHash === proposed.webhookPayloadHash
  );
}

export function sameRetryEvidence(
  stored: MembershipConfirmationSnapshot,
  proposed: MembershipConfirmationRetryEvidence
) {
  return (
    stored.tenantId === proposed.tenantId &&
    stored.providerReference === proposed.providerReference &&
    stored.providerEventId === proposed.providerEventId &&
    stored.webhookPayloadHash === proposed.webhookPayloadHash
  );
}

export async function claimReadyRetry(
  repository: MembershipConfirmationDeliveryRepository,
  authority: TenantAuthority,
  idempotencyKey: string,
  evidence: MembershipConfirmationRetryEvidence
): Promise<MembershipConfirmationClaim | { kind: 'not_found' } | { kind: 'requires_context' }> {
  assertAuthorityTenant(authority, evidence.tenantId);
  return claimStoredDelivery({
    repository,
    authority,
    idempotencyKey,
    tenantId: evidence.tenantId,
    evidenceMatches: (existing, stored) =>
      existing.tenantId === evidence.tenantId &&
      existing.userId === stored.userId &&
      (existing.subscriptionId === null || existing.subscriptionId === stored.subscriptionId) &&
      sameRetryEvidence(stored, evidence),
    authorizedClaim: () => ({ kind: 'requires_context' }),
  });
}

export async function claimExistingDelivery(
  repository: MembershipConfirmationDeliveryRepository,
  authority: TenantAuthority,
  idempotencyKey: string,
  evidence: MembershipConfirmationEvidence
): Promise<MembershipConfirmationClaim | { kind: 'not_found' }> {
  assertAuthorityTenant(authority, evidence.tenantId);
  const result = await claimStoredDelivery({
    repository,
    authority,
    idempotencyKey,
    tenantId: evidence.tenantId,
    evidenceMatches: (existing, stored) =>
      existing.userId === evidence.userId && sameProviderEvidence(stored, evidence),
    authorizedClaim: (existing, stored) => ({
      kind: 'claimed',
      deliveryId: existing.id,
      requiresEffects: true,
      snapshot: stored,
    }),
  });
  return result.kind === 'requires_context' ? { kind: 'conflict' } : result;
}

export async function claimStoredDelivery(args: {
  repository: MembershipConfirmationDeliveryRepository;
  authority: TenantAuthority;
  idempotencyKey: string;
  tenantId: string;
  evidenceMatches: (existing: StoredDeliveryRow, stored: MembershipConfirmationSnapshot) => boolean;
  authorizedClaim: (
    existing: StoredDeliveryRow,
    stored: MembershipConfirmationSnapshot
  ) => Extract<MembershipConfirmationClaim, { kind: 'claimed' }> | { kind: 'requires_context' };
}): Promise<MembershipConfirmationClaim | { kind: 'not_found' } | { kind: 'requires_context' }> {
  const existing = await args.repository.find(args.authority, args.idempotencyKey);
  if (!existing) return { kind: 'not_found' };
  // A stored row outside the delivery's tenant is a conflict; it is never claimed or reclaimed.
  if (existing.tenantId !== args.tenantId) return { kind: 'conflict' };

  const parsed = metadataSchema.safeParse(existing.metadata);
  if (!parsed.success || !args.evidenceMatches(existing, parsed.data.snapshot)) {
    return { kind: 'conflict' };
  }
  if (existing.status === 'skipped') return { kind: 'already_skipped' };
  if (existing.status === 'sent') return { kind: 'already_sent' };
  if (existing.status === 'authorized') {
    return args.authorizedClaim(existing, parsed.data.snapshot);
  }
  if (existing.status === 'pending') {
    return readyDeliveryClaim(existing, parsed.data.snapshot);
  }
  if (existing.status !== 'error') return { kind: 'conflict' };

  const reclaimed = await args.repository.reclaimError(args.authority, args.idempotencyKey);
  return reclaimed ? readyDeliveryClaim(existing, parsed.data.snapshot) : { kind: 'in_progress' };
}

export function readyDeliveryClaim(
  existing: StoredDeliveryRow,
  snapshot: MembershipConfirmationSnapshot
): Extract<MembershipConfirmationClaim, { kind: 'claimed' }> {
  return {
    kind: 'claimed',
    deliveryId: existing.id,
    requiresEffects: false,
    snapshot,
  };
}
