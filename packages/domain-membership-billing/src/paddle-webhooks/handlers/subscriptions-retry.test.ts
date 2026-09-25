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
      name: 'buyer',
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
        {}
      )
    ).rejects.toBeInstanceOf(RetryablePaddleWebhookError);

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(hoisted.appendEvent).not.toHaveBeenCalled();
  });
});
