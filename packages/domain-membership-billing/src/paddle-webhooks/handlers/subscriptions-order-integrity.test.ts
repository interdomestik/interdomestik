import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionChanged } from './subscriptions';
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

const CUSTOMER_ID = 'ctm_01hrffh7gvp29kc7xahm8wddwa';

function entitySubscriptionCreated() {
  return {
    eventType: 'subscription.created',
    processingScopeKey: 'entity:ks',
    data: {
      id: 'sub_entity_1',
      status: 'active',
      transactionId: 'txn_entity_1',
      customerId: CUSTOMER_ID,
      currencyCode: 'EUR',
      customData: { tenantId: 'tenant_ks', userId: 'user_123' },
      items: [{ price: { id: 'pri_membership' }, quantity: 1 }],
      currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
    },
  };
}

function completedEntityTransaction(overrides: Record<string, unknown> = {}) {
  return {
    processingResult: 'ok',
    payload: {
      data: {
        id: 'txn_entity_1',
        status: 'completed',
        subscriptionId: 'sub_entity_1',
        customerId: CUSTOMER_ID,
        currencyCode: 'EUR',
        customData: { tenantId: 'tenant_ks', userId: 'user_123' },
        details: {
          totals: { total: '2000', currencyCode: 'EUR' },
          lineItems: [{ priceId: 'pri_membership', quantity: 1, totals: { total: '2000' } }],
        },
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
});

describe('entity subscription order integrity', () => {
  it('defers until its completed transaction receipt exists', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue(null);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.com',
      tenantId: 'tenant_ks',
    });

    await expect(handleSubscriptionChanged(entitySubscriptionCreated())).rejects.toThrow(
      'Verified transaction txn_entity_1 is not ready'
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
  });

  it('rejects an initial lifecycle update without causal order authority', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.com',
      tenantId: 'tenant_ks',
    });

    await expect(
      handleSubscriptionChanged({
        ...createActiveSubscriptionUpdatedEvent(),
        processingScopeKey: 'entity:ks',
      })
    ).rejects.toThrow('Initial entity subscription requires subscription.created');
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
  });

  it('writes entitlement only after full order reconciliation', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue(completedEntityTransaction());
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.com',
      tenantId: 'tenant_ks',
      agentId: 'agent_user',
    });

    await handleSubscriptionChanged(entitySubscriptionCreated());

    expect(hoisted.db.query.webhookEvents.findFirst).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.tx.insert).toHaveBeenCalled();
  });

  it('fails closed before entitlement when order currency conflicts', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue(
      completedEntityTransaction({ currencyCode: 'USD' })
    );
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.com',
      tenantId: 'tenant_ks',
    });

    await expect(handleSubscriptionChanged(entitySubscriptionCreated())).rejects.toThrow(
      'Provider order integrity failed'
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
  });
});
