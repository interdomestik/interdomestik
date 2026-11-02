import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { expect } from 'vitest';
import type { MembershipConfirmationEvidence, MembershipConfirmationSnapshot } from './types';
import {
  createMembershipConfirmationDeliveryStore,
  type MembershipConfirmationDeliveryRepository,
} from './membership-confirmation-delivery';

export type Row = {
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

export const authority: TenantAuthority = mintTestTenantAuthority('tenant_mk');
export const tenantOf = (value: TenantAuthority) => readTenantAuthority(value).tenantId;

export function createRepository() {
  const rows = new Map<string, Row>();
  const repository: MembershipConfirmationDeliveryRepository = {
    async insertPending(_authority, row) {
      if (rows.has(row.dedupeKey)) return null;
      rows.set(row.dedupeKey, {
        ...row,
        providerMessageId: null,
        error: null,
      });
      return { id: row.id };
    },
    async find(value, dedupeKey) {
      const row = rows.get(dedupeKey);
      return row?.tenantId === tenantOf(value) ? row : null;
    },
    async reclaimError(value, dedupeKey) {
      const row = rows.get(dedupeKey);
      if (!row || row.tenantId !== tenantOf(value) || row.status !== 'error') return false;
      row.status = 'pending';
      row.error = null;
      return true;
    },
    async markReady(value, deliveryId, dedupeKey, subscriptionId) {
      const row = rows.get(dedupeKey);
      if (
        !row ||
        row.tenantId !== tenantOf(value) ||
        row.id !== deliveryId ||
        row.status !== 'authorized'
      ) {
        return false;
      }
      row.status = 'pending';
      row.subscriptionId = subscriptionId;
      return true;
    },
    async markSent(value, deliveryId, dedupeKey, providerMessageId) {
      const row = rows.get(dedupeKey);
      if (
        !row ||
        row.tenantId !== tenantOf(value) ||
        row.id !== deliveryId ||
        row.status !== 'pending'
      ) {
        return false;
      }
      row.status = 'sent';
      row.providerMessageId = providerMessageId;
      return true;
    },
    async markError(value, deliveryId, dedupeKey, error) {
      const row = rows.get(dedupeKey);
      if (
        !row ||
        row.tenantId !== tenantOf(value) ||
        row.id !== deliveryId ||
        row.status !== 'pending'
      ) {
        return false;
      }
      row.status = 'error';
      row.error = error;
      return true;
    },
  };

  return { repository, rows };
}

export const snapshot: MembershipConfirmationSnapshot = {
  email: 'member@example.test',
  memberName: 'Member One',
  memberNumber: 'MEM-2026-001',
  planName: 'Annual membership',
  planPrice: 'EUR 20.00',
  planInterval: 'year',
  memberSince: '2026-01-01T00:00:00.000Z',
  expiresAt: '2027-01-01T00:00:00.000Z',
  locale: 'en',
  tenantId: 'tenant_mk',
  userId: 'user_123',
  subscriptionId: 'subscription_internal_1',
  providerReference: 'sub_provider_1',
  providerEventId: 'evt_provider_1',
  webhookPayloadHash: 'payload_hash_1',
  providerStatus: 'active',
  eventType: 'subscription.created',
  emailRequest: {
    to: 'member@example.test',
    subject: 'Membership confirmed',
    html: '<p>Membership confirmed</p>',
    text: 'Membership confirmed',
  },
};

export const idempotencyKey = 'membership-confirmation:v1:tenant_mk:sub_provider_1';
export const evidence: MembershipConfirmationEvidence = {
  tenantId: snapshot.tenantId,
  userId: snapshot.userId,
  subscriptionId: snapshot.subscriptionId,
  providerReference: snapshot.providerReference,
  providerEventId: snapshot.providerEventId,
  webhookPayloadHash: snapshot.webhookPayloadHash,
};
export const retryEvidence = {
  tenantId: snapshot.tenantId,
  providerReference: snapshot.providerReference,
  providerEventId: snapshot.providerEventId,
  webhookPayloadHash: snapshot.webhookPayloadHash,
};

export async function expectStoredSnapshotRetry(
  store: ReturnType<typeof createMembershipConfirmationDeliveryStore>
) {
  await expect(
    store.claimExisting({
      authority,
      evidence,
      idempotencyKey,
    })
  ).resolves.toEqual({
    kind: 'claimed',
    deliveryId: 'delivery_123',
    requiresEffects: false,
    snapshot,
  });
}
