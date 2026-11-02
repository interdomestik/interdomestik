import {
  installMembershipConfirmationHooks,
  authority,
  sendThankYouLetter,
  prepareThankYouLetter,
  deliveryStore,
  userRecord,
  subscription,
} from './membership-confirmation.fixtures.test-support';
import { describe, expect, it } from 'vitest';
import { RetryablePaddleWebhookError } from '../../errors';
import { processMembershipConfirmation } from './membership-confirmation';

describe('processMembershipConfirmation', () => {
  installMembershipConfirmationHooks();

  it('sends exact active provider and authoritative member values', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.created',
      providerEventId: 'evt_provider_1',
      webhookPayloadHash: 'payload_hash_1',
      sub: subscription,
      authority,
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
    expect(deliveryStore.claimExisting).toHaveBeenCalledWith(
      expect.objectContaining({ authority })
    );
    expect(deliveryStore.claim).toHaveBeenCalledWith(expect.objectContaining({ authority }));
    expect(deliveryStore.complete).toHaveBeenCalledWith({
      deliveryId: 'delivery_123',
      idempotencyKey: 'membership-confirmation:v1:tenant_mk:sub_provider_1',
      providerMessageId: 'email_123',
      authority,
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
      authority,
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

      const processing = processMembershipConfirmation({
        eventType: 'subscription.created',
        providerEventId: 'evt_provider_1',
        webhookPayloadHash: 'payload_hash_1',
        sub: subscription,
        authority,
        userId: 'user_123',
        customData: { locale: 'en' },
        userRecord,
        deps: {
          membershipConfirmationDelivery: deliveryStore,
          prepareThankYouLetter,
          sendThankYouLetter,
        },
      });
      if (kind === 'in_progress') {
        await expect(processing).rejects.toBeInstanceOf(RetryablePaddleWebhookError);
      } else {
        await processing;
      }

      expect(sendThankYouLetter).not.toHaveBeenCalled();
      expect(deliveryStore.complete).not.toHaveBeenCalled();
    }
  );
});
