import { describe, expect, it } from 'vitest';

import {
  createMembershipConfirmationDeliveryStore,
  type MembershipConfirmationDeliveryRepository,
} from './membership-confirmation-delivery';
import type { MembershipConfirmationRetryEvidence, MembershipConfirmationSnapshot } from './types';

const snapshot: MembershipConfirmationSnapshot = {
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

const idempotencyKey = 'membership-confirmation:v1:tenant_mk:sub_provider_1';
const evidence: MembershipConfirmationRetryEvidence = {
  tenantId: snapshot.tenantId,
  providerReference: snapshot.providerReference,
  providerEventId: snapshot.providerEventId,
  webhookPayloadHash: snapshot.webhookPayloadHash,
};

function createStore(status: 'authorized' | 'pending' | 'error') {
  const row = {
    id: 'delivery_123',
    tenantId: snapshot.tenantId,
    userId: snapshot.userId,
    subscriptionId: status === 'authorized' ? null : snapshot.subscriptionId,
    dedupeKey: idempotencyKey,
    status,
    providerMessageId: null,
    error: status === 'error' ? 'temporary provider failure' : null,
    metadata: { kind: 'membership_confirmation', version: 1, snapshot },
  };
  const repository: MembershipConfirmationDeliveryRepository = {
    async insertPending() {
      return null;
    },
    async find(tenantId, dedupeKey) {
      return row.tenantId === tenantId && row.dedupeKey === dedupeKey ? row : null;
    },
    async reclaimError(tenantId, dedupeKey) {
      if (row.tenantId !== tenantId || row.dedupeKey !== dedupeKey || row.status !== 'error') {
        return false;
      }
      row.status = 'pending';
      row.error = null;
      return true;
    },
    async markReady() {
      return false;
    },
    async markSent() {
      return false;
    },
    async markError() {
      return false;
    },
  };
  return { row, store: createMembershipConfirmationDeliveryStore(repository) };
}

describe('membership confirmation ready retry claim', () => {
  it('requires context while the stored delivery still needs subscription effects', async () => {
    const { store } = createStore('authorized');

    await expect(store.claimReadyRetry!({ evidence, idempotencyKey })).resolves.toEqual({
      kind: 'requires_context',
    });
  });

  it.each(['pending', 'error'] as const)(
    'claims a stored %s delivery without current context',
    async status => {
      const { row, store } = createStore(status);

      await expect(store.claimReadyRetry!({ evidence, idempotencyKey })).resolves.toEqual({
        kind: 'claimed',
        deliveryId: 'delivery_123',
        requiresEffects: false,
        snapshot,
      });
      expect(row.status).toBe('pending');
    }
  );

  it('rejects a retry when immutable provider evidence differs', async () => {
    const { store } = createStore('pending');

    await expect(
      store.claimReadyRetry!({
        idempotencyKey,
        evidence: { ...evidence, webhookPayloadHash: 'different_hash' },
      })
    ).resolves.toEqual({ kind: 'conflict' });
  });
});
