import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RetryablePaddleWebhookError } from '../errors';
import { handleSubscriptionChanged } from './subscriptions';
import { resetPaddleHandlerMocks } from './test-support';

const hoisted = await vi.hoisted(() =>
  import('./test-support').then(({ createHoistedPaddleHandlerMocks }) =>
    createHoistedPaddleHandlerMocks()
  )
);

vi.mock('@interdomestik/database', async () => {
  const support = await import('./test-support');
  return support.createPaddleDatabaseMockModule(hoisted);
});
vi.mock('../../commissions/create', async () => {
  const support = await import('./test-support');
  return support.createCommissionMockModule();
});
vi.mock('@interdomestik/database/member-number', async () => {
  const support = await import('./test-support');
  return support.createMemberNumberMockModule();
});

const CUSTOMER_ID = 'ctm_01hrffh7gvp29kc7xahm8wddwa';

function subscriptionData(id: string, transactionId: string) {
  return {
    id,
    status: 'active',
    customerId: CUSTOMER_ID,
    transactionId,
    customData: { tenantId: 'tenant_mk', agentId: 'agent_9' },
    items: [
      {
        price: { id: 'pri_123', unitPrice: { amount: '2000', currencyCode: 'EUR' } },
      },
    ],
    currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
  };
}

describe('handleSubscriptionChanged entity retry', () => {
  beforeEach(() => {
    resetPaddleHandlerMocks(hoisted);
  });

  it('reconciles with authoritative provider customer evidence before subscription upsert', async () => {
    const requestPasswordResetOnboarding = vi.fn();
    const resolvePaddleCustomer = vi.fn().mockResolvedValue({
      kind: 'resolved',
      customer: { id: CUSTOMER_ID, email: 'buyer@example.com', status: 'active' },
    });
    const transactionCustomData = {
      tenantId: 'tenant_mk',
      agentId: 'agent_9',
      acquisitionSource: 'self_serve_web',
    };
    const newMember = {
      id: 'user_new',
      tenantId: 'tenant_mk',
      email: 'buyer@example.com',
      name: '',
      memberNumber: 'MEM-2026-000123',
      branchId: 'branch-mk-main',
      role: 'member',
    };
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      processingResult: 'ok',
      payload: {
        data: {
          customerId: CUSTOMER_ID,
          customData: transactionCustomData,
        },
      },
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(newMember);
    hoisted.db.query.account.findFirst.mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.created',
        processingScopeKey: 'entity:mk',
        data: subscriptionData('sub_new', 'txn_anon'),
      },
      { requestPasswordResetOnboarding, resolvePaddleCustomer }
    );

    expect(resolvePaddleCustomer).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(requestPasswordResetOnboarding).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      tenantId: 'tenant_mk',
    });
    expect(hoisted.tx.insert).toHaveBeenCalled();
  });

  it('defers before any write when the verified transaction is absent', async () => {
    const sendThankYouLetter = vi.fn();
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.user.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue(undefined);

    await expect(
      handleSubscriptionChanged(
        {
          eventType: 'subscription.created',
          processingScopeKey: 'entity:mk',
          data: subscriptionData('sub_waiting', 'txn_waiting'),
        },
        { sendThankYouLetter }
      )
    ).rejects.toBeInstanceOf(RetryablePaddleWebhookError);

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(hoisted.appendEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('retries a persisted confirmation without replaying completed subscription effects', async () => {
    const sendThankYouLetter = vi.fn().mockResolvedValue({ success: true, id: 'email_retry' });
    const prepareThankYouLetter = vi.fn(() => ({
      to: 'member@example.test',
      subject: 'Current subject',
      html: '<p>Current body</p>',
      text: 'Current body',
    }));
    const storedRequest = {
      to: 'member@example.test',
      subject: 'Stored subject',
      html: '<p>Stored body</p>',
      text: 'Stored body',
    };
    const membershipConfirmationDelivery = {
      claimExisting: vi.fn().mockResolvedValue({ kind: 'not_found' }),
      claim: vi.fn(async ({ snapshot }) => ({
        kind: 'claimed' as const,
        deliveryId: 'delivery_retry',
        requiresEffects: false,
        snapshot: { ...snapshot, emailRequest: storedRequest },
      })),
      ready: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_retry',
      tenantId: 'tenant_mk',
      userId: 'user_1',
      status: 'active',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_1',
      tenantId: 'tenant_mk',
      email: 'member@example.test',
      name: 'Member One',
      memberNumber: 'MEM-1',
      role: 'member',
    });
    const data = subscriptionData('sub_retry', 'txn_retry');
    data.customData = {
      tenantId: 'tenant_mk',
      agentId: 'agent_9',
      userId: 'user_1',
      locale: 'en',
    } as typeof data.customData;
    Object.assign(data.items[0]!.price, { name: 'Annual membership' });
    Object.assign(data, { billingCycle: { frequency: 1, interval: 'year' } });

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.created',
        providerEventId: 'evt_retry',
        webhookPayloadHash: 'payload_hash_retry',
        data,
      },
      { membershipConfirmationDelivery, prepareThankYouLetter, sendThankYouLetter }
    );

    expect(sendThankYouLetter).toHaveBeenCalledWith(
      expect.objectContaining({ request: storedRequest })
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(hoisted.appendEvent).not.toHaveBeenCalled();
    expect(membershipConfirmationDelivery.ready).not.toHaveBeenCalled();
  });
});
