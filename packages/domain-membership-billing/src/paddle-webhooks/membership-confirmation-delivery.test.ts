import { describe, expect, it } from 'vitest';

import type { MembershipConfirmationSnapshot } from './types';
import {
  createMembershipConfirmationDeliveryStore,
  type MembershipConfirmationDeliveryRepository,
} from './membership-confirmation-delivery';

type Row = {
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

function createRepository() {
  const rows = new Map<string, Row>();
  const repository: MembershipConfirmationDeliveryRepository = {
    async insertPending(row) {
      if (rows.has(row.dedupeKey)) return null;
      rows.set(row.dedupeKey, {
        ...row,
        providerMessageId: null,
        error: null,
      });
      return { id: row.id };
    },
    async find(tenantId, dedupeKey) {
      const row = rows.get(dedupeKey);
      return row?.tenantId === tenantId ? row : null;
    },
    async reclaimError(tenantId, dedupeKey) {
      const row = rows.get(dedupeKey);
      if (!row || row.tenantId !== tenantId || row.status !== 'error') return false;
      row.status = 'pending';
      row.error = null;
      return true;
    },
    async markReady(tenantId, deliveryId, dedupeKey, subscriptionId) {
      const row = rows.get(dedupeKey);
      if (
        !row ||
        row.tenantId !== tenantId ||
        row.id !== deliveryId ||
        row.status !== 'authorized'
      ) {
        return false;
      }
      row.status = 'pending';
      row.subscriptionId = subscriptionId;
      return true;
    },
    async markSent(tenantId, deliveryId, dedupeKey, providerMessageId) {
      const row = rows.get(dedupeKey);
      if (!row || row.tenantId !== tenantId || row.id !== deliveryId || row.status !== 'pending') {
        return false;
      }
      row.status = 'sent';
      row.providerMessageId = providerMessageId;
      return true;
    },
    async markError(tenantId, deliveryId, dedupeKey, error) {
      const row = rows.get(dedupeKey);
      if (!row || row.tenantId !== tenantId || row.id !== deliveryId || row.status !== 'pending') {
        return false;
      }
      row.status = 'error';
      row.error = error;
      return true;
    },
  };

  return { repository, rows };
}

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

async function expectStoredSnapshotRetry(
  store: ReturnType<typeof createMembershipConfirmationDeliveryStore>
) {
  await expect(
    store.claim({
      idempotencyKey,
      snapshot: { ...snapshot, email: 'changed@example.test', memberName: 'Changed Member' },
    })
  ).resolves.toEqual({
    kind: 'claimed',
    deliveryId: 'delivery_123',
    requiresEffects: false,
    snapshot,
  });
}

describe('membership confirmation delivery store', () => {
  it('records one immutable snapshot and suppresses a delivered replay', async () => {
    const { repository, rows } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');

    await expect(store.claim({ idempotencyKey, snapshot })).resolves.toEqual({
      kind: 'claimed',
      deliveryId: 'delivery_123',
      requiresEffects: true,
      snapshot,
    });
    await store.ready({
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
      tenantId: 'tenant_mk',
    });
    await store.complete({
      deliveryId: 'delivery_123',
      idempotencyKey,
      providerMessageId: 'email_123',
      tenantId: 'tenant_mk',
    });

    expect(rows.get(idempotencyKey)).toEqual(
      expect.objectContaining({
        status: 'sent',
        providerMessageId: 'email_123',
        metadata: { kind: 'membership_confirmation', version: 1, snapshot },
      })
    );
    await expect(store.claim({ idempotencyKey, snapshot })).resolves.toEqual({
      kind: 'already_sent',
    });
  });

  it('reclaims a failed same-event delivery with the original snapshot', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
    const claimed = await store.claim({ idempotencyKey, snapshot });
    expect(claimed.kind).toBe('claimed');
    await store.ready({
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
      tenantId: 'tenant_mk',
    });
    await store.fail({
      deliveryId: 'delivery_123',
      error: 'temporary provider failure',
      idempotencyKey,
      tenantId: 'tenant_mk',
    });

    await expectStoredSnapshotRetry(store);
  });

  it('rejects contradictory provider evidence for the same subscription', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
    await store.claim({ idempotencyKey, snapshot });
    await store.ready({
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
      tenantId: 'tenant_mk',
    });
    await store.fail({
      deliveryId: 'delivery_123',
      error: 'temporary provider failure',
      idempotencyKey,
      tenantId: 'tenant_mk',
    });

    await expect(
      store.claim({
        idempotencyKey,
        snapshot: {
          ...snapshot,
          providerEventId: 'evt_provider_2',
          webhookPayloadHash: 'payload_hash_2',
        },
      })
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('recovers a pending same-event attempt with the original snapshot and delivery identity', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');

    await expect(store.claim({ idempotencyKey, snapshot })).resolves.toMatchObject({
      kind: 'claimed',
    });
    await store.ready({
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
      tenantId: 'tenant_mk',
    });
    await expectStoredSnapshotRetry(store);
  });

  it('treats concurrent readiness and completion for the same immutable delivery as idempotent', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');

    await store.claim({ idempotencyKey, snapshot });
    const readiness = {
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
      tenantId: 'tenant_mk',
    };
    await store.ready(readiness);
    await expect(store.ready(readiness)).resolves.toBeUndefined();

    const completion = {
      deliveryId: 'delivery_123',
      idempotencyKey,
      providerMessageId: 'email_123',
      tenantId: 'tenant_mk',
    };
    await store.complete(completion);
    await expect(store.complete(completion)).resolves.toBeUndefined();
  });
});
