import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryablePaddleWebhookError } from '../../errors';
import { processMembershipConfirmation } from './membership-confirmation';

describe('processMembershipConfirmation', () => {
  const sendThankYouLetter = vi.fn();
  const prepareThankYouLetter = vi.fn();
  const deliveryStore = {
    claim: vi.fn(),
    ready: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };
  const userRecord = {
    email: 'member@example.test',
    name: 'Member One',
    memberNumber: 'MEM-2026-001',
  };
  const subscription = {
    id: 'sub_provider_1',
    status: 'active',
    items: [
      {
        price: {
          name: 'Annual membership',
          unit_price: { amount: '2000', currency_code: 'EUR' },
        },
      },
    ],
    billing_cycle: { frequency: 1, interval: 'year' },
    current_billing_period: {
      starts_at: '2026-01-01T00:00:00Z',
      ends_at: '2027-01-01T00:00:00Z',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sendThankYouLetter.mockResolvedValue({ success: true, id: 'email_123' });
    prepareThankYouLetter.mockImplementation(({ email }) => ({
      to: email,
      subject: 'Membership confirmed',
      html: '<p>Membership confirmed</p>',
      text: 'Membership confirmed',
    }));
    deliveryStore.claim.mockImplementation(async ({ snapshot }) => ({
      kind: 'claimed',
      deliveryId: 'delivery_123',
      requiresEffects: true,
      snapshot,
    }));
  });

  it('sends exact active provider and authoritative member values', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.created',
      providerEventId: 'evt_provider_1',
      webhookPayloadHash: 'payload_hash_1',
      sub: subscription,
      tenantId: 'tenant_mk',
      userId: 'user_123',
      internalSubscriptionId: 'subscription_internal_1',
      customData: { locale: 'sr' },
      userRecord,
      deps: {
        membershipConfirmationDelivery: deliveryStore,
        prepareThankYouLetter,
        sendThankYouLetter,
      },
    });

    expect(sendThankYouLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        request: {
          to: 'member@example.test',
          subject: 'Membership confirmed',
          html: '<p>Membership confirmed</p>',
          text: 'Membership confirmed',
        },
        providerReference: 'sub_provider_1',
        tenantId: 'tenant_mk',
        idempotencyKey: 'membership-confirmation:v1:tenant_mk:sub_provider_1',
      })
    );
    expect(deliveryStore.complete).toHaveBeenCalledWith({
      deliveryId: 'delivery_123',
      idempotencyKey: 'membership-confirmation:v1:tenant_mk:sub_provider_1',
      providerMessageId: 'email_123',
      tenantId: 'tenant_mk',
    });
  });

  it('retries a failed delivery from the immutable first snapshot', async () => {
    const immutableSnapshot = {
      email: 'original@example.test',
      memberName: 'Original Member',
      memberNumber: 'MEM-ORIGINAL',
      planName: 'Original annual membership',
      planPrice: 'EUR 20.00',
      planInterval: 'year',
      memberSince: '2026-01-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      locale: 'en' as const,
      tenantId: 'tenant_mk',
      userId: 'user_123',
      subscriptionId: 'subscription_internal_1',
      providerReference: 'sub_provider_1',
      providerEventId: 'evt_provider_1',
      webhookPayloadHash: 'payload_hash_1',
      providerStatus: 'active',
      eventType: 'subscription.created',
      emailRequest: {
        to: 'original@example.test',
        subject: 'Original subject',
        html: '<p>Original body</p>',
        text: 'Original body',
      },
    };
    deliveryStore.claim.mockResolvedValue({
      kind: 'claimed',
      deliveryId: 'delivery_123',
      requiresEffects: false,
      snapshot: immutableSnapshot,
    });

    await processMembershipConfirmation({
      eventType: 'subscription.created',
      providerEventId: 'evt_provider_1',
      webhookPayloadHash: 'payload_hash_1',
      sub: subscription,
      tenantId: 'tenant_mk',
      userId: 'user_123',
      customData: { locale: 'sr' },
      userRecord,
      deps: {
        membershipConfirmationDelivery: deliveryStore,
        prepareThankYouLetter,
        sendThankYouLetter,
      },
    });

    expect(sendThankYouLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        request: immutableSnapshot.emailRequest,
      })
    );
  });

  it.each(['already_sent', 'in_progress', 'conflict'] as const)(
    'does not dispatch when the delivery claim is %s',
    async kind => {
      deliveryStore.claim.mockResolvedValue({ kind });

      await processMembershipConfirmation({
        eventType: 'subscription.created',
        providerEventId: 'evt_provider_1',
        webhookPayloadHash: 'payload_hash_1',
        sub: subscription,
        tenantId: 'tenant_mk',
        userId: 'user_123',
        customData: { locale: 'en' },
        userRecord,
        deps: {
          membershipConfirmationDelivery: deliveryStore,
          prepareThankYouLetter,
          sendThankYouLetter,
        },
      });

      expect(sendThankYouLetter).not.toHaveBeenCalled();
      expect(deliveryStore.complete).not.toHaveBeenCalled();
    }
  );

  it('refuses an active confirmation from a non-created provider event', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.updated',
      sub: subscription,
      tenantId: 'tenant_mk',
      customData: { locale: 'sr' },
      userRecord,
      deps: { sendThankYouLetter },
    });

    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('refuses a confirmation while a reconciled member still has no authoritative name', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.created',
      sub: subscription,
      tenantId: 'tenant_mk',
      customData: { locale: 'en' },
      userRecord: {
        ...userRecord,
        name: '',
      },
      deps: { sendThankYouLetter },
    });

    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it.each(['trialing', 'past_due', 'paused', 'canceled', 'deleted'])(
    'does not send active confirmation for provider status %s',
    async status => {
      await processMembershipConfirmation({
        eventType: 'subscription.created',
        sub: { ...subscription, status },
        tenantId: 'tenant_mk',
        customData: { locale: 'mk' },
        userRecord,
        deps: { sendThankYouLetter },
      });

      expect(sendThankYouLetter).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['missing locale', subscription, undefined, userRecord],
    ['unsupported locale', subscription, { locale: 'de' }, userRecord],
    ['non-string locale', subscription, { locale: 42 }, userRecord],
    [
      'missing provider price',
      { ...subscription, items: [] },
      { locale: 'mk' as const },
      userRecord,
    ],
    [
      'missing provider period',
      { ...subscription, current_billing_period: undefined },
      { locale: 'mk' as const },
      userRecord,
    ],
    [
      'missing member number',
      subscription,
      { locale: 'mk' as const },
      { ...userRecord, memberNumber: null },
    ],
  ])('does not invent confirmation values when %s', async (_name, sub, customData, member) => {
    await processMembershipConfirmation({
      eventType: 'subscription.created',
      sub,
      tenantId: 'tenant_mk',
      customData,
      userRecord: member,
      deps: { sendThankYouLetter },
    });

    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('makes an unavailable delivery dependency retryable', async () => {
    await expect(
      processMembershipConfirmation({
        eventType: 'subscription.created',
        providerEventId: 'evt_provider_1',
        webhookPayloadHash: 'payload_hash_1',
        sub: subscription,
        tenantId: 'tenant_mk',
        userId: 'user_123',
        customData: { locale: 'mk' },
        userRecord,
        deps: {},
      })
    ).rejects.toBeInstanceOf(RetryablePaddleWebhookError);
  });

  it('fails closed without immutable provider event identity', async () => {
    await expect(
      processMembershipConfirmation({
        eventType: 'subscription.created',
        sub: subscription,
        tenantId: 'tenant_mk',
        userId: 'user_123',
        customData: { locale: 'mk' },
        userRecord,
        deps: {
          membershipConfirmationDelivery: deliveryStore,
          prepareThankYouLetter,
          sendThankYouLetter,
        },
      })
    ).resolves.toBeUndefined();
    expect(deliveryStore.claim).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });
});
