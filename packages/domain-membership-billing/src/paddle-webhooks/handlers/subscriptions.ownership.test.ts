import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionChanged } from './subscriptions';
import {
  createActiveSubscriptionUpdatedEvent,
  mockRacedSubscriptionInsert,
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

vi.mock('@interdomestik/database/paddle-provider-resolution', async () =>
  (await import('./test-support')).createPaddleResolutionMockModule(hoisted)
);

vi.mock('../../commissions/create', async () =>
  (await import('./test-support')).createCommissionMockModule()
);

vi.mock('@interdomestik/database/member-number', async () =>
  (await import('./test-support')).createMemberNumberMockModule()
);

const logAuditEvent = vi.fn();

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
});

describe('handleSubscriptionChanged', () => {
  it('retries as an update when a raced insert hits a unique constraint', async () => {
    const { mockSet, mockWhere } = mockRacedSubscriptionInsert(hoisted);

    hoisted.db.query.subscriptions.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'mock_sub_existing',
        tenantId: 'tenant_abc',
        userId: 'user_123',
      });
    mockUserOwner(hoisted, 'tenant_abc');
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
    mockUserOwner(hoisted, 'tenant_abc');
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
