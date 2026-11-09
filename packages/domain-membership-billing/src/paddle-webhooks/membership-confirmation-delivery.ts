import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { nanoid } from 'nanoid';

import { databaseMembershipConfirmationDeliveryRepository } from './membership-confirmation-delivery-repository';
import type { MembershipConfirmationDeliveryStore } from './types';
import {
  assertAuthorityTenant,
  claimReadyRetry,
  claimExistingDelivery,
} from './membership-confirmation-delivery-claims';

type PendingDeliveryRow = {
  id: string;
  tenantId: string;
  userId: string;
  subscriptionId: null;
  dedupeKey: string;
  status: 'authorized';
  metadata: Record<string, unknown>;
};

export type StoredDeliveryRow = {
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
  insertPending: (
    authority: TenantAuthority,
    row: PendingDeliveryRow
  ) => Promise<{ id: string } | null>;
  find: (authority: TenantAuthority, dedupeKey: string) => Promise<StoredDeliveryRow | null>;
  reclaimError: (authority: TenantAuthority, dedupeKey: string) => Promise<boolean>;
  markReady: (
    authority: TenantAuthority,
    deliveryId: string,
    dedupeKey: string,
    subscriptionId: string
  ) => Promise<boolean>;
  markSent: (
    authority: TenantAuthority,
    deliveryId: string,
    dedupeKey: string,
    providerMessageId: string
  ) => Promise<boolean>;
  markSkipped: (
    authority: TenantAuthority,
    deliveryId: string,
    dedupeKey: string
  ) => Promise<boolean>;
  markError: (
    authority: TenantAuthority,
    deliveryId: string,
    dedupeKey: string,
    error: string
  ) => Promise<boolean>;
};

export function createMembershipConfirmationDeliveryStore(
  repository: MembershipConfirmationDeliveryRepository,
  generateId: () => string = nanoid
): MembershipConfirmationDeliveryStore {
  return {
    async claimReadyRetry({ authority, evidence, idempotencyKey }) {
      return claimReadyRetry(repository, authority, idempotencyKey, evidence);
    },

    async claimExisting({ authority, evidence, idempotencyKey }) {
      return claimExistingDelivery(repository, authority, idempotencyKey, evidence);
    },

    async claim({ authority, idempotencyKey, snapshot }) {
      assertAuthorityTenant(authority, snapshot.tenantId);
      const metadata = { kind: 'membership_confirmation' as const, version: 1 as const, snapshot };
      const inserted = await repository.insertPending(authority, {
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
      const existingClaim = await claimExistingDelivery(
        repository,
        authority,
        idempotencyKey,
        snapshot
      );
      return existingClaim.kind === 'not_found' ? { kind: 'conflict' } : existingClaim;
    },

    async ready({ authority, deliveryId, idempotencyKey, subscriptionId }) {
      const updated = await repository.markReady(
        authority,
        deliveryId,
        idempotencyKey,
        subscriptionId
      );
      if (updated) return;
      const existing = await repository.find(authority, idempotencyKey);
      if (
        existing?.id === deliveryId &&
        existing.subscriptionId === subscriptionId &&
        ['pending', 'sent', 'error'].includes(existing.status)
      ) {
        return;
      }
      throw new Error('Membership confirmation delivery readiness lost its claim');
    },

    async complete({ authority, deliveryId, idempotencyKey, providerMessageId }) {
      const updated = await repository.markSent(
        authority,
        deliveryId,
        idempotencyKey,
        providerMessageId
      );
      if (updated) return;
      const existing = await repository.find(authority, idempotencyKey);
      if (
        existing?.id === deliveryId &&
        existing.status === 'sent' &&
        existing.providerMessageId === providerMessageId
      ) {
        return;
      }
      throw new Error('Membership confirmation delivery completion lost its claim');
    },

    async skip({ authority, deliveryId, idempotencyKey }) {
      if (await repository.markSkipped(authority, deliveryId, idempotencyKey)) return;
      const existing = await repository.find(authority, idempotencyKey);
      if (existing?.id === deliveryId && existing.status === 'skipped') return;
      throw new Error('Membership confirmation suppression lost its claim');
    },

    async fail({ authority, deliveryId, error, idempotencyKey }) {
      const updated = await repository.markError(
        authority,
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
