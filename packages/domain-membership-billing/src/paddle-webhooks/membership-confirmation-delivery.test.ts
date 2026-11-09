import {
  authority,
  createRepository,
  evidence,
  expectStoredSnapshotRetry,
  idempotencyKey,
  retryEvidence,
  snapshot,
} from './membership-confirmation-delivery.test-support';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it } from 'vitest';
import {
  createMembershipConfirmationDeliveryStore,
  type MembershipConfirmationDeliveryRepository,
} from './membership-confirmation-delivery';

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

it('settles suppressed confirmation and refuses all replay claims without a receipt', async () => {
  const { repository, rows } = createRepository();
  const store = createMembershipConfirmationDeliveryStore(repository, () => 'delivery_123');
  await store.claim({ authority, idempotencyKey, snapshot });
  const claim = { authority, idempotencyKey, deliveryId: 'delivery_123' };
  await store.ready({ ...claim, subscriptionId: snapshot.subscriptionId });
  await store.skip(claim);
  await store.skip(claim);
  expect(rows.get(idempotencyKey)).toMatchObject({
    status: 'skipped',
    providerMessageId: null,
    error: null,
  });
  expect(await store.claim({ authority, idempotencyKey, snapshot })).toEqual({
    kind: 'already_skipped',
  });
  expect(
    await store.claimReadyRetry!({ authority, idempotencyKey, evidence: retryEvidence })
  ).toEqual({ kind: 'already_skipped' });
});
