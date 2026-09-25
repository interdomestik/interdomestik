import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCommissionWithDispositionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

const databaseMocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  findAgentSettings: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    agentId: 'agentClients.agentId',
    memberId: 'agentClients.memberId',
    tenantId: 'agentClients.tenantId',
  },
  and: vi.fn((...parts: unknown[]) => ({ op: 'and', parts })),
  appendEvent: databaseMocks.appendEvent,
  db: {
    query: { agentSettings: { findFirst: databaseMocks.findAgentSettings } },
    transaction: databaseMocks.transaction,
  },
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
}));
vi.mock('../../../commissions/create', () => ({ createCommissionWithDispositionCore: vi.fn() }));
vi.mock('../../../commissions/create-renewal', () => ({ createRenewalCommissionCore: vi.fn() }));

describe('new subscription extras idempotency', () => {
  const logAuditEvent = vi.fn();
  const tx = { update: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.findAgentSettings.mockResolvedValue(null);
    databaseMocks.transaction.mockImplementation(
      async (callback: (trx: typeof tx) => Promise<unknown> | unknown) => callback(tx)
    );
    databaseMocks.appendEvent.mockResolvedValue({ id: 'event_existing' });
    tx.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });
  });

  it('does not duplicate the commission-created audit for an existing commission', async () => {
    vi.mocked(createCommissionWithDispositionCore).mockResolvedValue({
      success: true,
      data: { id: 'commission_existing', created: false },
    });

    await handleNewSubscriptionExtras({
      eventType: 'subscription.created',
      providerEventId: 'evt_provider_1',
      sub: { id: 'sub_1', items: [{ price: { unitPrice: { amount: '2000' } } }] },
      userId: 'user_1',
      tenantId: 'tenant_1',
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: { email: 'member@example.test', memberNumber: 'M-1', name: 'Member' },
      deps: { logAuditEvent },
    });

    expect(logAuditEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'commission.created' })
    );
  });
});
