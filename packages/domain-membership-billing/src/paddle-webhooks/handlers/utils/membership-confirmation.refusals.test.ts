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

  it('refuses an active confirmation from a non-created provider event', async () => {
    await processMembershipConfirmation({
      eventType: 'subscription.updated',
      sub: subscription,
      authority,
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
      authority,
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
        authority,
        customData: { locale: 'mk' },
        userRecord,
        deps: { sendThankYouLetter },
      });

      expect(sendThankYouLetter).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['missing locale', subscription, undefined, userRecord],
    ['unsupported locale', subscription, { locale: 'hr' }, userRecord],
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
      authority,
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
        authority,
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
        authority,
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
