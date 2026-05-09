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

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
});

describe('handleSubscriptionChanged', () => {
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

    // Verify Zod allowed it -> DB called
    expect(hoisted.db.insert).toHaveBeenCalled();

    // Verify Tenant Resolved
    expect(hoisted.db.query.user.findFirst).toHaveBeenCalledWith(expect.anything());

    // Verify Audit Log
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'subscription.updated',
        entityId: 'sub_123',
        tenantId: 'tenant_abc', // <--- Critical Check
        metadata: expect.objectContaining({ status: 'active', userId: 'user_123' }),
      })
    );
  });

  it('ignores invalid payload safely (Zod)', async () => {
    const invalidPayload = {
      id: 'sub_123',
      // Missing status
      customData: { userId: 'user_123' },
    };

    await handleSubscriptionChanged(
      { eventType: 'subscription.updated', data: invalidPayload },
      { logAuditEvent }
    );

    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('reconciles an anonymous subscription.created before upserting the subscription', async () => {
    const requestPasswordResetOnboarding = vi.fn();

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
        name: 'buyer',
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
          customData: { tenantId: 'tenant_mk', agentId: 'agent_9' },
          items: [
            {
              price: { id: 'pri_123', unitPrice: { amount: '2000', currencyCode: 'EUR' } },
            },
          ],
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      },
      { requestPasswordResetOnboarding }
    );

    expect(requestPasswordResetOnboarding).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      tenantId: 'tenant_mk',
    });
    expect(hoisted.db.transaction).toHaveBeenCalledTimes(2);
    expect(hoisted.db.insert).toHaveBeenCalled();
  });

  it('throws when a valid subscription event cannot resolve tenant context', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.user.findFirst.mockResolvedValue(undefined);

    await expect(
      handleSubscriptionChanged(
        {
          eventType: 'subscription.created',
          data: {
            id: 'sub_missing_tenant',
            status: 'active',
            customData: { userId: 'user_without_tenant' },
            items: [
              {
                price: { id: 'pri_123', unitPrice: { amount: '2000', currencyCode: 'EUR' } },
              },
            ],
            currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
          },
        },
        { logAuditEvent }
      )
    ).rejects.toThrow('Unable to resolve subscription context');

    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('fails closed when provider tenant metadata conflicts with canonical subscription tenant', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_real',
      userId: 'user_123',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_real',
    });

    await expect(
      handleSubscriptionChanged(
        {
          eventType: 'subscription.updated',
          data: {
            id: 'sub_existing',
            status: 'active',
            customData: { userId: 'user_123', tenantId: 'tenant_bad' },
            items: [
              {
                price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { logAuditEvent }
      )
    ).rejects.toThrow('customData tenant=tenant_bad conflicts with canonical tenant=tenant_real');

    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(hoisted.db.update).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('does not fall back to checkout reconciliation for subscription.created tenant conflicts', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_real',
      userId: 'user_123',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      tenantId: 'tenant_real',
    });

    await expect(
      handleSubscriptionChanged(
        {
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
        { logAuditEvent }
      )
    ).rejects.toThrow('customData tenant=tenant_bad conflicts with canonical tenant=tenant_real');

    expect(hoisted.db.query.webhookEvents.findFirst).not.toHaveBeenCalled();
    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('uses existing subscription canonical user when provider customData omits userId', async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.db.update.mockReturnValue({ set: mockSet });

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_canonical',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_canonical',
      email: 'test@example.com',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionChanged(
      {
        eventType: 'subscription.updated',
        data: {
          id: 'sub_existing',
          status: 'active',
          customData: { tenantId: 'tenant_abc' },
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

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_abc',
        userId: 'user_canonical',
      })
    );
    expect(mockWhere).toHaveBeenCalled();
  });

  it('updates an existing user-scoped subscription row instead of inserting a second row', async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined);
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    hoisted.db.update.mockReturnValue({ set: mockSet });

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

    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(hoisted.db.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSubscriptionId: 'sub_paddle_456',
      })
    );
    expect(mockWhere).toHaveBeenCalled();
  });

  it('stores the canonical annual plan id instead of the Paddle price id', async () => {
    const insertedValues = vi.fn().mockResolvedValue(undefined);

    hoisted.db.insert.mockReturnValue({
      values: insertedValues,
    });
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
      expect.objectContaining({
        planId: 'standard',
        planKey: 'mk-standard-plan',
      })
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

    expect(hoisted.db.insert).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        providerSubscriptionId: 'sub_paddle_456',
      })
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

    hoisted.db.insert.mockReturnValue({
      values: insertedValues,
    });
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
      expect.objectContaining({
        userId: 'user_123',
        agentId: resolvedAgentId,
      })
    );
  });
});
