import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleTransactionCompleted } from './transaction';
import { expectProviderSubscriptionReferenceLookup, resetPaddleHandlerMocks } from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');

  return createHoistedPaddleHandlerMocks();
});

vi.mock('@interdomestik/database', async () => {
  const mocks = await import('./test-support');

  return mocks.createPaddleDatabaseMockModule(hoisted);
});

vi.mock('../../commissions/create', async () => {
  const mocks = await import('./test-support');

  return mocks.createCommissionMockModule();
});

vi.mock('@interdomestik/database/member-number', async () => {
  const mocks = await import('./test-support');

  return mocks.createMemberNumberMockModule();
});

const logAuditEvent = vi.fn();

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
});

describe('handleTransactionCompleted', () => {
  it('logs payment.processed event with tenantId', async () => {
    // Mock User resolution
    hoisted.db.query.user.findFirst.mockResolvedValue({
      tenantId: 'tenant_abc',
    });

    const validPayload = {
      id: 'tx_123',
      status: 'completed',
      subscriptionId: 'sub_123',
      customData: { userId: 'user_123' },
      details: { totals: { total: '1000', currencyCode: 'USD' } },
    };

    await handleTransactionCompleted({ data: validPayload }, { logAuditEvent });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'payment.processed',
        entityId: 'tx_123',
        tenantId: 'tenant_abc',
        metadata: expect.objectContaining({ amount: '1000', currency: 'USD' }),
      })
    );
  });

  it('skips tenant-scoped audit for anonymous transactions with only provider customData tenant', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);

    const payload = {
      id: 'tx_anon',
      status: 'completed',
      subscriptionId: 'sub_anon',
      customerId: 'ctm_123',
      customerEmail: 'buyer@example.com',
      customData: {
        tenantId: 'tenant_mk',
        acquisitionSource: 'self_serve_web',
        agentId: 'agent_9',
        utmSource: 'google',
        utmCampaign: 'diaspora',
      },
      details: { totals: { total: '3500', currencyCode: 'EUR' } },
    };

    await handleTransactionCompleted({ data: payload }, { logAuditEvent });

    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
  });

  it('prefers persisted subscription ownership over stale transaction customData agent attribution', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      tenantId: 'tenant_real',
      agentId: 'agent_canonical',
    });

    const payload = {
      id: 'tx_existing_owner',
      status: 'completed',
      subscriptionId: 'sub_existing_owner',
      customData: {
        tenantId: 'tenant_real',
        agentId: 'agent_stale',
      },
      details: { totals: { total: '2000', currencyCode: 'EUR' } },
    };

    await handleTransactionCompleted({ data: payload }, { logAuditEvent });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_real',
        metadata: expect.objectContaining({
          agentId: 'agent_canonical',
        }),
      })
    );
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
  });

  it('uses canonical user ownership for transaction audit metadata when no subscription owner exists', async () => {
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      tenantId: 'tenant_abc',
      agentId: null,
    });

    const payload = {
      id: 'tx_user_owned',
      status: 'completed',
      customData: {
        userId: 'user_123',
        tenantId: 'tenant_abc',
        agentId: 'agent_stale',
      },
      details: { totals: { total: '1000', currencyCode: 'USD' } },
    };

    await handleTransactionCompleted({ data: payload }, { logAuditEvent });

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_abc',
        metadata: expect.objectContaining({
          agentId: null,
          userId: 'user_123',
        }),
      })
    );
  });

  it('skips transaction audit when provider tenant metadata conflicts with persisted subscription', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      tenantId: 'tenant_real',
    });

    const payload = {
      id: 'tx_existing',
      status: 'completed',
      subscriptionId: 'sub_existing',
      customData: {
        tenantId: 'tenant_bad',
        acquisitionSource: 'self_serve_web',
      },
      details: { totals: { total: '2000', currencyCode: 'EUR' } },
    };

    await handleTransactionCompleted({ data: payload }, { logAuditEvent });

    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('canonical tenant=tenant_real customData tenant=tenant_bad')
    );
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips transaction audit when provider user metadata conflicts with persisted subscription user', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      tenantId: 'tenant_real',
      userId: 'user_real',
    });

    await handleTransactionCompleted(
      {
        data: {
          id: 'tx_user_conflict',
          status: 'completed',
          subscriptionId: 'sub_existing',
          customData: {
            userId: 'user_bad',
            tenantId: 'tenant_real',
          },
          details: { totals: { total: '2000', currencyCode: 'EUR' } },
        },
      },
      { logAuditEvent }
    );

    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('subscription user=user_real customData user=user_bad')
    );

    warnSpy.mockRestore();
  });

  it('resolves transaction tenant from provider subscription id lookups', async () => {
    hoisted.db.query.subscriptions.findFirst.mockImplementationOnce(async args => {
      expectProviderSubscriptionReferenceLookup(args, 'sub_provider_456');
      return { tenantId: 'tenant_real' };
    });

    await handleTransactionCompleted(
      {
        data: {
          id: 'tx_provider_lookup',
          status: 'completed',
          subscriptionId: 'sub_provider_456',
          details: { totals: { total: '2000', currencyCode: 'EUR' } },
        },
      },
      { logAuditEvent }
    );

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_real',
      })
    );
  });
});
