import { nanoid } from 'nanoid';
import { z } from 'zod';

import { databaseMembershipConfirmationDeliveryRepository } from './membership-confirmation-delivery-repository';
import type { MembershipConfirmationDeliveryStore, MembershipConfirmationSnapshot } from './types';

type PendingDeliveryRow = {
  id: string;
  tenantId: string;
  userId: string;
  subscriptionId: null;
  dedupeKey: string;
  status: 'authorized';
  metadata: Record<string, unknown>;
};

type StoredDeliveryRow = {
  id: string;
  tenantId: string;
  userId: string;
  subscriptionId: string | null;
  dedupeKey: string;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
};

export type MembershipConfirmationDeliveryRepository = {
  insertPending: (row: PendingDeliveryRow) => Promise<{ id: string } | null>;
  find: (tenantId: string, dedupeKey: string) => Promise<StoredDeliveryRow | null>;
  reclaimError: (tenantId: string, dedupeKey: string) => Promise<boolean>;
  markReady: (
    tenantId: string,
    deliveryId: string,
    dedupeKey: string,
    subscriptionId: string
  ) => Promise<boolean>;
  markSent: (
    tenantId: string,
    deliveryId: string,
    dedupeKey: string,
    providerMessageId: string
  ) => Promise<boolean>;
  markError: (
    tenantId: string,
    deliveryId: string,
    dedupeKey: string,
    error: string
  ) => Promise<boolean>;
};

const snapshotSchema = z.object({
  email: z.string().min(1),
  memberName: z.string().min(1),
  memberNumber: z.string().min(1),
  planName: z.string().min(1),
  planPrice: z.string().min(1),
  planInterval: z.string().min(1),
  memberSince: z.string().datetime(),
  expiresAt: z.string().datetime(),
  locale: z.enum(['en', 'sq', 'mk', 'sr']),
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
  }),
});

const metadataSchema = z.object({
  kind: z.literal('membership_confirmation'),
  version: z.literal(1),
  snapshot: snapshotSchema,
});

function sameProviderEvidence(
  stored: MembershipConfirmationSnapshot,
  proposed: MembershipConfirmationSnapshot
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

export function createMembershipConfirmationDeliveryStore(
  repository: MembershipConfirmationDeliveryRepository,
  generateId: () => string = nanoid
): MembershipConfirmationDeliveryStore {
  return {
    async claim({ idempotencyKey, snapshot }) {
      const metadata = { kind: 'membership_confirmation' as const, version: 1 as const, snapshot };
      const inserted = await repository.insertPending({
        id: generateId(),
        tenantId: snapshot.tenantId,
        userId: snapshot.userId,
        subscriptionId: null,
        dedupeKey: idempotencyKey,
        status: 'authorized',
        metadata,
      });
      if (inserted) {
        return { kind: 'claimed', deliveryId: inserted.id, requiresEffects: true, snapshot };
      }

      const existing = await repository.find(snapshot.tenantId, idempotencyKey);
      const parsed = metadataSchema.safeParse(existing?.metadata);
      if (
        !existing ||
        !parsed.success ||
        existing.userId !== snapshot.userId ||
        !sameProviderEvidence(parsed.data.snapshot, snapshot)
      ) {
        return { kind: 'conflict' };
      }
      if (existing.status === 'sent') return { kind: 'already_sent' };
      if (existing.status === 'authorized') {
        return {
          kind: 'claimed',
          deliveryId: existing.id,
          requiresEffects: true,
          snapshot: parsed.data.snapshot,
        };
      }
      if (existing.status === 'pending') {
        return {
          kind: 'claimed',
          deliveryId: existing.id,
          requiresEffects: false,
          snapshot: parsed.data.snapshot,
        };
      }
      if (existing.status !== 'error') return { kind: 'conflict' };

      const reclaimed = await repository.reclaimError(snapshot.tenantId, idempotencyKey);
      return reclaimed
        ? {
            kind: 'claimed',
            deliveryId: existing.id,
            requiresEffects: false,
            snapshot: parsed.data.snapshot,
          }
        : { kind: 'in_progress' };
    },

    async ready({ deliveryId, idempotencyKey, subscriptionId, tenantId }) {
      const updated = await repository.markReady(
        tenantId,
        deliveryId,
        idempotencyKey,
        subscriptionId
      );
      if (updated) return;
      const existing = await repository.find(tenantId, idempotencyKey);
      if (
        existing?.id === deliveryId &&
        existing.subscriptionId === subscriptionId &&
        ['pending', 'sent', 'error'].includes(existing.status)
      ) {
        return;
      }
      throw new Error('Membership confirmation delivery readiness lost its claim');
    },

    async complete({ deliveryId, idempotencyKey, providerMessageId, tenantId }) {
      const updated = await repository.markSent(
        tenantId,
        deliveryId,
        idempotencyKey,
        providerMessageId
      );
      if (updated) return;
      const existing = await repository.find(tenantId, idempotencyKey);
      if (
        existing?.id === deliveryId &&
        existing.status === 'sent' &&
        existing.providerMessageId === providerMessageId
      ) {
        return;
      }
      throw new Error('Membership confirmation delivery completion lost its claim');
    },

    async fail({ deliveryId, error, idempotencyKey, tenantId }) {
      const updated = await repository.markError(
        tenantId,
        deliveryId,
        idempotencyKey,
        error.slice(0, 2000)
      );
      if (!updated) throw new Error('Membership confirmation delivery failure lost its claim');
    },
  };
}

export const membershipConfirmationDeliveryStore = createMembershipConfirmationDeliveryStore(
  databaseMembershipConfirmationDeliveryRepository
);
