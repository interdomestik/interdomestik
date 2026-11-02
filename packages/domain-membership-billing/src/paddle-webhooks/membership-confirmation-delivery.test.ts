import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it } from 'vitest';

import type { MembershipConfirmationEvidence, MembershipConfirmationSnapshot } from './types';
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

const authority = mintTestTenantAuthority('tenant_mk');
const tenantOf = (value: TenantAuthority) => readTenantAuthority(value).tenantId;

function createRepository() {
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
const evidence: MembershipConfirmationEvidence = {
  tenantId: snapshot.tenantId,
  userId: snapshot.userId,
  subscriptionId: snapshot.subscriptionId,
  providerReference: snapshot.providerReference,
  providerEventId: snapshot.providerEventId,
  webhookPayloadHash: snapshot.webhookPayloadHash,
};
const retryEvidence = {
  tenantId: snapshot.tenantId,
  providerReference: snapshot.providerReference,
  providerEventId: snapshot.providerEventId,
  webhookPayloadHash: snapshot.webhookPayloadHash,
};

async function expectStoredSnapshotRetry(
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

describe('membership confirmation delivery store', () => {
  it('records one immutable snapshot and suppresses a delivered replay', async () => {
    const { repository, rows } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');

    await expect(store.claimExisting({ authority, evidence, idempotencyKey })).resolves.toEqual({
      kind: 'not_found',
    });
    await expect(store.claim({ authority, idempotencyKey, snapshot })).resolves.toEqual({
      kind: 'claimed',
      deliveryId: 'delivery_123',
      requiresEffects: true,
      snapshot,
    });
    await expect(
      store.claimReadyRetry!({ authority, idempotencyKey, evidence: retryEvidence })
    ).resolves.toEqual({ kind: 'requires_context' });
    await store.ready({
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
    });
    await store.complete({
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      providerMessageId: 'email_123',
    });

    expect(rows.get(idempotencyKey)).toEqual(
      expect.objectContaining({
        status: 'sent',
        providerMessageId: 'email_123',
        metadata: { kind: 'membership_confirmation', version: 1, snapshot },
      })
    );
    await expect(store.claim({ authority, idempotencyKey, snapshot })).resolves.toEqual({
      kind: 'already_sent',
    });
  });

  it('reclaims a failed same-event delivery with the original snapshot', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
    const claimed = await store.claim({ authority, idempotencyKey, snapshot });
    expect(claimed.kind).toBe('claimed');
    await store.ready({
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
    });
    await store.fail({
      authority,
      deliveryId: 'delivery_123',
      error: 'temporary provider failure',
      idempotencyKey,
    });

    await expectStoredSnapshotRetry(store);
    await expect(
      store.claimReadyRetry!({ authority, idempotencyKey, evidence: retryEvidence })
    ).resolves.toMatchObject({ kind: 'claimed', requiresEffects: false, snapshot });
  });

  it('rejects contradictory provider evidence for the same subscription', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
    await store.claim({ authority, idempotencyKey, snapshot });
    await store.ready({
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
    });
    await store.fail({
      authority,
      deliveryId: 'delivery_123',
      error: 'temporary provider failure',
      idempotencyKey,
    });

    await expect(
      store.claim({
        authority,
        idempotencyKey,
        snapshot: {
          ...snapshot,
          providerEventId: 'evt_provider_2',
          webhookPayloadHash: 'payload_hash_2',
        },
      })
    ).resolves.toEqual({ kind: 'conflict' });
    await expect(
      store.claimReadyRetry!({
        authority,
        idempotencyKey,
        evidence: { ...retryEvidence, providerEventId: 'evt_provider_2' },
      })
    ).resolves.toEqual({ kind: 'conflict' });
  });

  it('recovers a pending same-event attempt with the original snapshot and delivery identity', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');

    await expect(store.claim({ authority, idempotencyKey, snapshot })).resolves.toMatchObject({
      kind: 'claimed',
    });
    await store.ready({
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
    });
    await expectStoredSnapshotRetry(store);
  });

  it('treats concurrent readiness and completion for the same immutable delivery as idempotent', async () => {
    const { repository } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');

    await store.claim({ authority, idempotencyKey, snapshot });
    const readiness = {
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
    };
    await store.ready(readiness);
    await expect(store.ready(readiness)).resolves.toBeUndefined();

    const completion = {
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      providerMessageId: 'email_123',
    };
    await store.complete(completion);
    await expect(store.complete(completion)).resolves.toBeUndefined();
  });
  it('refuses a claim whose snapshot names another tenant than the delivery authority', async () => {
    const { repository, rows } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
    const otherAuthority = mintTestTenantAuthority('tenant_ks');

    await expect(
      store.claim({ authority: otherAuthority, idempotencyKey, snapshot })
    ).rejects.toThrow('tenant conflict');
    await expect(
      store.claimExisting({ authority: otherAuthority, evidence, idempotencyKey })
    ).rejects.toThrow('tenant conflict');
    await expect(
      store.claimReadyRetry!({ authority: otherAuthority, idempotencyKey, evidence: retryEvidence })
    ).rejects.toThrow('tenant conflict');
    expect(rows.size).toBe(0);
  });

  it('treats a stored row from another tenant as a conflict without reclaiming or writing', async () => {
    const { repository, rows } = createRepository();
    const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
    await store.claim({ authority, idempotencyKey, snapshot });
    await store.ready({
      authority,
      deliveryId: 'delivery_123',
      idempotencyKey,
      subscriptionId: 'subscription_internal_1',
    });
    await store.fail({
      authority,
      deliveryId: 'delivery_123',
      error: 'temporary provider failure',
      idempotencyKey,
    });
    const before = structuredClone(rows.get(idempotencyKey));

    // A repository that returned a row outside the delivery's tenant must never be reclaimed.
    const leakyRepository: MembershipConfirmationDeliveryRepository = {
      ...repository,
      find: async (_value, dedupeKey) => rows.get(dedupeKey) ?? null,
      reclaimError: async () => {
        throw new Error('reclaim must not run for a row of another tenant');
      },
    };
    const leakyStore = createMembershipConfirmationDeliveryStore(leakyRepository);
    rows.get(idempotencyKey)!.tenantId = 'tenant_ks';

    await expect(
      leakyStore.claimExisting({ authority, evidence, idempotencyKey })
    ).resolves.toEqual({ kind: 'conflict' });
    await expect(
      leakyStore.claimReadyRetry!({ authority, idempotencyKey, evidence: retryEvidence })
    ).resolves.toEqual({ kind: 'conflict' });
    expect(rows.get(idempotencyKey)).toEqual({ ...before, tenantId: 'tenant_ks' });
  });
});
