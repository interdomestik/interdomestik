import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionChanged } from './subscriptions';
import { resetPaddleHandlerMocks } from './test-support';

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

describe('returning subscription confirmation', () => {
  const sendThankYouLetter = vi.fn().mockResolvedValue({ success: true, id: 'email_123' });
  const prepareThankYouLetter = vi.fn(({ email }) => ({
    to: email,
    subject: 'Membership confirmed',
    html: '<p>Membership confirmed</p>',
    text: 'Membership confirmed',
  }));
  const membershipConfirmationDelivery = {
    claim: vi.fn(async ({ snapshot }) => ({
      kind: 'claimed' as const,
      deliveryId: 'delivery_123',
      requiresEffects: true,
      snapshot,
    })),
    ready: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  };

  beforeEach(() => {
    resetPaddleHandlerMocks(hoisted);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.test',
      name: 'Member One',
      memberNumber: 'MEM-2026-001',
      tenantId: 'tenant_mk',
    });
  });

  it('binds a replacement provider subscription to the existing one-per-user internal row', async () => {
    hoisted.db.query.subscriptions.findFirst
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 'subscription_internal_existing',
        status: 'active',
        tenantId: 'tenant_mk',
        userId: 'user_123',
      });

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.created',
        providerEventId: 'evt_returning_1',
        webhookPayloadHash: 'payload_hash_returning_1',
        data: {
          id: 'sub_provider_replacement',
          status: 'active',
          customData: {
            userId: 'user_123',
            tenantId: 'tenant_mk',
            agentId: 'agent_1',
            locale: 'en',
          },
          items: [
            {
              price: {
                id: 'pri_123',
                name: 'Annual membership',
                unitPrice: { amount: '2000', currencyCode: 'EUR' },
              },
            },
          ],
          billingCycle: { frequency: 1, interval: 'year' },
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      },
      { membershipConfirmationDelivery, prepareThankYouLetter, sendThankYouLetter }
    );

    expect(membershipConfirmationDelivery.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          subscriptionId: 'subscription_internal_existing',
          providerReference: 'sub_provider_replacement',
        }),
      })
    );
    expect(membershipConfirmationDelivery.ready).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'subscription_internal_existing' })
    );
  });
});
