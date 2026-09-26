import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCommissionWithDispositionCore } from '../../commissions/create';
import { PaddleEventOrderingError } from '../errors';
import { handleSubscriptionChanged } from './subscriptions';
import { upsertSubscription } from './subscription-upsert';
import { createActiveSubscriptionUpdatedEvent, resetPaddleHandlerMocks } from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');
  return createHoistedPaddleHandlerMocks();
});

vi.mock('@interdomestik/database', async () =>
  (await import('./test-support')).createPaddleDatabaseMockModule(hoisted)
);
vi.mock('../../commissions/create', async () =>
  (await import('./test-support')).createCommissionMockModule()
);
vi.mock('@interdomestik/database/member-number', async () =>
  (await import('./test-support')).createMemberNumberMockModule()
);
vi.mock('./subscription-upsert', async importOriginal => ({
  ...(await importOriginal<typeof import('./subscription-upsert')>()),
  upsertSubscription: vi.fn(),
}));

const OCCURRED_AT = '2026-09-26T10:18:49.621022Z';

function entityEvent(eventType: string, evidence: { providerEventOccurredAt?: string } = {}) {
  const event = createActiveSubscriptionUpdatedEvent();
  return {
    ...event,
    eventType,
    processingScopeKey: 'entity:ks',
    providerEventId: 'evt_stale',
    ...evidence,
    data: { ...event.data, customData: { tenantId: 'tenant_ks', userId: 'user_123' } },
  };
}

const STORED_REQUEST = {
  to: 'member@example.test',
  subject: 'Stored subject',
  html: '<p>Stored body</p>',
  text: 'Stored body',
};

function storedSnapshot() {
  return {
    email: 'member@example.test',
    memberName: 'Stored Member',
    memberNumber: 'MEM-STORED',
    planName: 'Annual membership',
    planPrice: '20.00 EUR',
    planInterval: 'year',
    memberSince: '2026-01-01T00:00:00.000Z',
    expiresAt: '2027-01-01T00:00:00.000Z',
    locale: 'en' as const,
    tenantId: 'tenant_ks',
    userId: 'user_123',
    subscriptionId: 'sub_paddle_456',
    providerReference: 'sub_paddle_456',
    providerEventId: 'evt_stale',
    webhookPayloadHash: 'payload_hash',
    providerStatus: 'active' as const,
    eventType: 'subscription.created' as const,
    emailRequest: STORED_REQUEST,
  };
}

// Every store method would make progress if reached, so "not called" is meaningful.
function deliveryDeps() {
  const claimed = (requiresEffects: boolean) => ({
    kind: 'claimed' as const,
    deliveryId: 'delivery_1',
    requiresEffects,
    snapshot: storedSnapshot(),
  });
  const membershipConfirmationDelivery = {
    claimReadyRetry: vi.fn().mockResolvedValue(claimed(false)),
    claimExisting: vi.fn().mockResolvedValue(claimed(true)),
    claim: vi.fn().mockResolvedValue(claimed(true)),
    ready: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  };
  return {
    logAuditEvent: vi.fn(),
    membershipConfirmationDelivery,
    prepareThankYouLetter: vi.fn(() => STORED_REQUEST),
    sendThankYouLetter: vi.fn().mockResolvedValue({ success: true, id: 'email_1' }),
  };
}

function entityCreated() {
  return {
    ...entityEvent('subscription.created', { providerEventOccurredAt: OCCURRED_AT }),
    tenantId: 'tenant_ks',
    webhookPayloadHash: 'payload_hash',
  };
}

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
  hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
    id: 'sub_paddle_456',
    status: 'canceled',
    tenantId: 'tenant_ks',
    userId: 'user_123',
  });
  hoisted.db.query.user.findFirst.mockResolvedValue({
    id: 'user_123',
    email: 'member@example.com',
    tenantId: 'tenant_ks',
  });
  vi.mocked(upsertSubscription).mockResolvedValue({
    subscriptionId: 'sub_paddle_456',
    effectsApplied: false,
    stale: true,
  });
});

describe('handleSubscriptionChanged provider event order', () => {
  it('fails closed before any read or write when signed ordering evidence is missing', async () => {
    const logAuditEvent = vi.fn();

    await expect(
      handleSubscriptionChanged(entityEvent('subscription.updated'), { logAuditEvent })
    ).rejects.toThrow(PaddleEventOrderingError);

    expect(hoisted.db.query.subscriptions.findFirst).not.toHaveBeenCalled();
    expect(hoisted.db.transaction).not.toHaveBeenCalled();
    expect(upsertSubscription).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('passes the signed order to the lifecycle write boundary', async () => {
    await handleSubscriptionChanged(
      entityEvent('subscription.updated', { providerEventOccurredAt: OCCURRED_AT })
    );

    expect(upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        order: {
          occurredAt: OCCURRED_AT,
          providerEventId: 'evt_stale',
          processingScopeKey: 'entity:ks',
        },
        tenantId: 'tenant_ks',
      })
    );
  });

  it.each(['subscription.updated', 'subscription.created'])(
    'emits no audit, extras or domain effects for a stale %s',
    async eventType => {
      const logAuditEvent = vi.fn();

      await expect(
        handleSubscriptionChanged(
          entityEvent(eventType, { providerEventOccurredAt: OCCURRED_AT }),
          { logAuditEvent }
        )
      ).resolves.toBeUndefined();

      expect(upsertSubscription).toHaveBeenCalledTimes(1);
      expect(logAuditEvent).not.toHaveBeenCalled();
      expect(hoisted.appendEvent).not.toHaveBeenCalled();
      expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    }
  );

  it('touches no confirmation store, sender, extras or audit when created is stale', async () => {
    const deps = deliveryDeps();

    await handleSubscriptionChanged(entityCreated(), deps);

    expect(upsertSubscription).toHaveBeenCalledTimes(1);
    for (const method of Object.values(deps.membershipConfirmationDelivery)) {
      expect(method).not.toHaveBeenCalled();
    }
    expect(deps.prepareThankYouLetter).not.toHaveBeenCalled();
    expect(deps.sendThankYouLetter).not.toHaveBeenCalled();
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
  });

  it('decides order before any confirmation claim for an applied created event', async () => {
    const deps = deliveryDeps();
    deps.membershipConfirmationDelivery.claimReadyRetry.mockResolvedValue({ kind: 'not_found' });
    deps.membershipConfirmationDelivery.claimExisting.mockResolvedValue({ kind: 'already_sent' });
    vi.mocked(upsertSubscription).mockResolvedValue({
      subscriptionId: 'sub_paddle_456',
      effectsApplied: true,
    });

    await handleSubscriptionChanged(entityCreated(), deps);

    const upsertOrder = vi.mocked(upsertSubscription).mock.invocationCallOrder[0]!;
    const store = deps.membershipConfirmationDelivery;
    expect(upsertOrder).toBeLessThan(store.claimReadyRetry.mock.invocationCallOrder[0]!);
    expect(upsertOrder).toBeLessThan(store.claimExisting.mock.invocationCallOrder[0]!);
    expect(deps.logAuditEvent).toHaveBeenCalledTimes(1);
    expect(deps.sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('lets an exact replay recover its stored confirmation without replaying effects', async () => {
    const deps = deliveryDeps();
    vi.mocked(upsertSubscription).mockResolvedValue({
      subscriptionId: 'sub_paddle_456',
      effectsApplied: false,
    });

    await handleSubscriptionChanged(entityCreated(), deps);

    expect(deps.sendThankYouLetter).toHaveBeenCalledWith(
      expect.objectContaining({ request: STORED_REQUEST })
    );
    expect(deps.membershipConfirmationDelivery.complete).toHaveBeenCalledTimes(1);
    expect(deps.membershipConfirmationDelivery.claimExisting).not.toHaveBeenCalled();
    expect(deps.membershipConfirmationDelivery.claim).not.toHaveBeenCalled();
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
  });

  it('keeps the unscoped legacy route free of the ordering requirement', async () => {
    const legacyEvent = { ...entityEvent('subscription.updated'), processingScopeKey: undefined };
    vi.mocked(upsertSubscription).mockResolvedValue({
      subscriptionId: 'sub_paddle_456',
      effectsApplied: true,
    });

    await handleSubscriptionChanged(legacyEvent);

    expect(upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ order: undefined }));
  });
});
