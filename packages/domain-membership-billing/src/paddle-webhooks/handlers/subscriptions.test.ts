import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionChanged } from './subscriptions';
import {
  createActiveSubscriptionUpdatedEvent,
  mockRacedSubscriptionInsert,
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

const logAuditEvent = vi.fn();
const sendThankYouLetter = vi.fn();
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

describe('handleSubscriptionChanged', () => {
  it('defers an initial entity subscription until its completed transaction receipt exists', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue(null);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.com',
      tenantId: 'tenant_ks',
      agentId: 'agent_user',
    });

    await expect(handleSubscriptionChanged(entitySubscriptionCreated())).rejects.toThrow(
      'Verified transaction txn_entity_1 is not ready'
    );
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
  });

  it('rejects an initial entity subscription update that has no causal order authority', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.com',
      tenantId: 'tenant_ks',
      agentId: 'agent_user',
    });

    await expect(
      handleSubscriptionChanged({
        ...createActiveSubscriptionUpdatedEvent(),
        processingScopeKey: 'entity:ks',
      })
    ).rejects.toThrow('Initial entity subscription requires subscription.created');
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
  });

  it('writes the initial entity entitlement only after full order reconciliation', async () => {
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

  it('fails closed before entitlement when the completed order currency conflicts', async () => {
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

  it('validates input and logs audit event on success', async () => {
    // Mock User
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_abc',
    });

    const validPayload = {
      id: 'sub_123',
      status: 'active',
      customData: { userId: 'user_123' },
      items: [{ price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } } }],
      currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
    };

    await handleSubscriptionChanged(
      { eventType: 'subscription.updated', data: validPayload },
      { logAuditEvent, sendThankYouLetter }
    );

    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.appendEvent).toHaveBeenCalledWith(
      hoisted.tx,
      expect.objectContaining({
        eventName: 'membership.subscription_changed',
        payload: { cancelAtPeriodEnd: false, fromStatus: 'none', toStatus: 'active' },
      })
    );
    expect(hoisted.db.query.user.findFirst).toHaveBeenCalledWith(expect.anything());
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.updated',
        entityId: 'sub_123',
        tenantId: 'tenant_abc', // <--- Critical Check
        metadata: expect.objectContaining({ status: 'active', userId: 'user_123' }),
      })
    );
  });

  it('reconciles an anonymous subscription.created before upserting the subscription', async () => {
    const requestPasswordResetOnboarding = vi.fn();
    const sendThankYouLetter = vi.fn();

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.webhookEvents.findFirst.mockResolvedValue({
      payload: {
        data: {
          customerEmail: 'buyer@example.com',
          customData: {
            tenantId: 'tenant_mk',
            agentId: 'agent_9',
            acquisitionSource: 'self_serve_web',
          },
        },
      },
    });
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'user_new',
        tenantId: 'tenant_mk',
        email: 'buyer@example.com',
        name: '',
        memberNumber: 'MEM-2026-000123',
        branchId: 'branch-mk-main',
        role: 'member',
      });
    hoisted.db.query.account.findFirst.mockResolvedValue(null);
    hoisted.db.query.tenantSettings.findFirst.mockResolvedValue({
      value: { branchId: 'branch-mk-main' },
    });

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.created',
        data: {
          id: 'sub_new',
          status: 'active',
          transactionId: 'txn_anon',
          customData: { tenantId: 'tenant_mk', agentId: 'agent_9', locale: 'en' },
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
      { requestPasswordResetOnboarding, sendThankYouLetter }
    );

    expect(requestPasswordResetOnboarding).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      tenantId: 'tenant_mk',
    });
    expect(hoisted.db.transaction).toHaveBeenCalledTimes(3);
    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('updates an existing user-scoped subscription row instead of inserting a second row', async () => {
    const mockWhere = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 'mock_sub_existing' }]),
    });
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.tx.update.mockReturnValue({ set: mockSet });

    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'mock_sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_123',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionChanged(createActiveSubscriptionUpdatedEvent(), { logAuditEvent });

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubscriptionId: 'sub_paddle_456' })
    );
    expect(mockWhere).toHaveBeenCalled();
  });

  it('stores the canonical annual plan id instead of the Paddle price id', async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);

    hoisted.tx.insert.mockReturnValue({ values: insertedValues });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_mk',
    });
    hoisted.selectResults.push([], [{ id: 'mk-standard-plan', tier: 'standard' }]);

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.updated',
        data: {
          id: 'sub_paddle_annual',
          status: 'active',
          customData: { userId: 'user_123' },
          items: [
            {
              price: {
                id: 'pri_standard_year_mk',
                unitPrice: { amount: '2000', currencyCode: 'EUR' },
              },
            },
          ],
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      },
      { logAuditEvent }
    );

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'standard', planKey: 'mk-standard-plan' })
    );
  });

  it('retries as an update when a raced insert hits a unique constraint', async () => {
    const { mockSet, mockWhere } = mockRacedSubscriptionInsert(hoisted);

    hoisted.db.query.subscriptions.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'mock_sub_existing',
        tenantId: 'tenant_abc',
        userId: 'user_123',
      });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionChanged(createActiveSubscriptionUpdatedEvent(), { logAuditEvent });

    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(hoisted.appendEvent).toHaveBeenCalledTimes(1);
    expect(hoisted.appendEvent).toHaveBeenCalledWith(
      hoisted.tx,
      expect.objectContaining({
        eventName: 'membership.subscription_changed',
        payload: { cancelAtPeriodEnd: false, fromStatus: 'none', toStatus: 'active' },
      })
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubscriptionId: 'sub_paddle_456' })
    );
    expect(mockWhere).toHaveBeenCalled();
  });

  it.each([
    {
      name: 'prefers the reconciled user agent over webhook customData when persisting subscription ownership',
      resolvedAgentId: 'agent_user',
      subscriptionId: 'sub_agent_owner',
    },
    {
      name: 'clears subscription ownership when the reconciled user is company-owned',
      resolvedAgentId: null,
      subscriptionId: 'sub_company_owner',
    },
  ])('$name', async ({ resolvedAgentId, subscriptionId }) => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);

    hoisted.tx.insert.mockReturnValue({ values: insertedValues });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
    hoisted.db.query.user.findFirst
      .mockResolvedValueOnce({
        tenantId: 'tenant_abc',
        email: 'test@example.com',
        name: 'Test User',
        memberNumber: 'MEM-2026-000001',
        agentId: resolvedAgentId,
      })
      .mockResolvedValueOnce({
        branchId: 'branch_abc',
      });

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.updated',
        data: {
          id: subscriptionId,
          status: 'active',
          customData: { userId: 'user_123', agentId: 'agent_stale' },
          items: [
            {
              price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
            },
          ],
          currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
        },
      },
      { logAuditEvent }
    );

    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user_123', agentId: resolvedAgentId })
    );
  });
});
