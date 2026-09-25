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

describe('subscription confirmation dispatch', () => {
  const logAuditEvent = vi.fn();
  const sendThankYouLetter = vi.fn();

  beforeEach(() => {
    resetPaddleHandlerMocks(hoisted);
    sendThankYouLetter.mockResolvedValue({ success: true });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
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
        eventType: 'subscription.created',
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
      { sendThankYouLetter }
    );

    expect(sendThankYouLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'member@example.test',
        locale: 'sr',
        memberNumber: 'MEM-2026-001',
        planInterval: 'godina',
        planName: 'Annual membership',
        planPrice: expect.stringContaining('EUR'),
        providerReference: 'sub_provider_1',
        tenantId: 'tenant_mk',
      })
    );
  });

  it('does not dispatch when checkout tenant conflicts with canonical ownership', async () => {
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

    expect(hoisted.db.query.webhookEvents.findFirst).not.toHaveBeenCalled();
    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('fails closed before dispatch when provider tenant conflicts with an existing subscription', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
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
        { logAuditEvent, sendThankYouLetter }
      )
    ).rejects.toThrow('customData tenant=tenant_bad conflicts with canonical tenant=tenant_real');

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(hoisted.tx.update).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores an invalid provider payload before any write or dispatch', async () => {
    await handleSubscriptionChanged(
      {
        eventType: 'subscription.updated',
        data: { id: 'sub_123', customData: { userId: 'user_123' } },
      },
      { logAuditEvent, sendThankYouLetter }
    );

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('fails before dispatch when a valid event has no canonical tenant context', async () => {
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
        { logAuditEvent, sendThankYouLetter }
      )
    ).rejects.toThrow('Unable to resolve subscription context');

    expect(hoisted.tx.insert).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });

  it('uses the existing subscription user when provider custom data omits userId', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'mock_sub_existing' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    hoisted.tx.update.mockReturnValue({ set });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_canonical',
    });
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_canonical',
      email: 'member@example.test',
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
      { logAuditEvent, sendThankYouLetter }
    );

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_abc', userId: 'user_canonical' })
    );
    expect(where).toHaveBeenCalled();
  });
});
