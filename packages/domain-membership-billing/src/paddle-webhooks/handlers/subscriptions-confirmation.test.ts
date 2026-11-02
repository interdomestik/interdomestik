import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSubscriptionChanged } from './subscriptions';
import {
  TEST_PADDLE_DELIVERY,
  mockSubscriptionOwner,
  mockUserOwner,
  resetPaddleHandlerMocks,
} from './test-support';

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

describe('subscription confirmation dispatch', () => {
  const logAuditEvent = vi.fn();
  const sendThankYouLetter = vi.fn();
  const prepareThankYouLetter = vi.fn(({ email }) => ({
    to: email,
    subject: 'Membership confirmed',
    html: '<p>Membership confirmed</p>',
    text: 'Membership confirmed',
  }));
  const membershipConfirmationDelivery = {
    claimExisting: vi.fn().mockResolvedValue({ kind: 'not_found' }),
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
    sendThankYouLetter.mockResolvedValue({ success: true, id: 'email_123' });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    mockUserOwner(hoisted, 'tenant_mk');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.test',
      name: 'Member One',
      memberNumber: 'MEM-2026-001',
      tenantId: 'tenant_mk',
    });
  });

  it('preserves exact active values from a raw Paddle payload', async () => {
    await handleSubscriptionChanged(
      {
        delivery: TEST_PADDLE_DELIVERY,
        eventType: 'subscription.created',
        providerEventId: 'evt_provider_1',
        webhookPayloadHash: 'payload_hash_1',
        data: {
          id: 'sub_provider_1',
          status: 'active',
          custom_data: {
            userId: 'user_123',
            tenantId: 'tenant_mk',
            agentId: 'agent_1',
            locale: 'sr',
          },
          items: [
            {
              price: {
                id: 'pri_123',
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
        },
      },
      { membershipConfirmationDelivery, prepareThankYouLetter, sendThankYouLetter }
    );

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
      })
    );
  });

  it('does not confirm an out-of-order active subscription.updated event with no existing row', async () => {
    await handleSubscriptionChanged(
      {
        delivery: TEST_PADDLE_DELIVERY,
        eventType: 'subscription.updated',
        data: {
          id: 'sub_provider_updated_first',
          status: 'active',
          custom_data: {
            userId: 'user_123',
            tenantId: 'tenant_mk',
            locale: 'sr',
          },
          items: [
            {
              price: {
                id: 'pri_123',
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
        },
      },
      { sendThankYouLetter }
    );

    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('does not dispatch when checkout tenant conflicts with canonical ownership', async () => {
    mockSubscriptionOwner(hoisted, { subscriptionId: 'sub_existing', tenantId: 'tenant_real' });
    mockUserOwner(hoisted, 'tenant_real');
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_real',
      userId: 'user_123',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.test',
      tenantId: 'tenant_real',
    });

    await expect(
      handleSubscriptionChanged(
        {
          delivery: TEST_PADDLE_DELIVERY,
          eventType: 'subscription.created',
          data: {
            id: 'sub_existing',
            status: 'active',
            transactionId: 'txn_existing',
            customData: { userId: 'user_123', tenantId: 'tenant_bad' },
            items: [
              {
                price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { logAuditEvent, sendThankYouLetter }
      )
    ).rejects.toThrow('customData tenant=tenant_bad conflicts with canonical tenant=tenant_real');

    expect(hoisted.resolution.readVerifiedPaddleTransactionEvidence).not.toHaveBeenCalled();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });
});
