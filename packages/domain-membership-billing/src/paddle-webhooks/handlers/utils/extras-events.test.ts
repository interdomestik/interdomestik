import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

const databaseMocks = vi.hoisted(() => ({
  appendEvent: vi.fn(),
  findAgentSettings: vi.fn(),
  findReferral: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    agentId: 'agentClients.agentId',
    memberId: 'agentClients.memberId',
    tenantId: 'agentClients.tenantId',
  },
  and: vi.fn((...parts) => ({ op: 'and', parts })),
  appendEvent: databaseMocks.appendEvent,
  db: {
    query: {
      agentSettings: { findFirst: databaseMocks.findAgentSettings },
      referrals: { findFirst: databaseMocks.findReferral },
    },
    transaction: databaseMocks.transaction,
  },
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
}));

vi.mock('../../../../../domain-referrals/src', () => ({ createMemberReferralRewardCore: vi.fn() }));
vi.mock('../../../commissions/create', () => ({ createCommissionCore: vi.fn() }));
vi.mock('../../../commissions/create-renewal', () => ({ createRenewalCommissionCore: vi.fn() }));

describe('handleNewSubscriptionExtras membership events', () => {
  const deps = { logAuditEvent: vi.fn(), sendThankYouLetter: vi.fn() };
  const tx = { insert: vi.fn(), update: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.appendEvent.mockResolvedValue({ id: 'event-1' });
    vi.mocked(createCommissionCore).mockResolvedValue({
      success: true,
      data: { id: 'commission-1' },
    });
    vi.mocked(createMemberReferralRewardCore).mockResolvedValue({
      success: true,
      data: { kind: 'no-op', created: false, reason: 'no_referral' },
    });
    databaseMocks.findAgentSettings.mockResolvedValue(null);
    databaseMocks.findReferral.mockResolvedValue(null);
    databaseMocks.transaction.mockImplementation(async callback => callback(tx));
    tx.update.mockReturnValue({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });
    tx.insert.mockReturnValue({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) })),
    });
  });

  it('emits sanitized read-only attribution event without granting read scope', async () => {
    await handleNewSubscriptionExtras({
      customData: { agentId: 'agent_1' },
      deps,
      priceId: 'price_1',
      sub: {
        id: 'sub_123',
        currentBillingPeriod: { endsAt: '2026-01-01T00:00:00Z' },
        items: [{ price: { unitPrice: { amount: '2000', currencyCode: 'EUR' } } }],
      },
      tenantId: 'tenant_1',
      userId: 'user_1',
      userRecord: { email: 'member@example.invalid', memberNumber: 'M-1', name: 'Member' },
    });

    expect(databaseMocks.appendEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actor: { id: 'paddle-webhook', role: 'system' },
        correlationId: 'membership:user_1:agent-attribution-recorded',
        entity: { id: 'user_1', type: 'member' },
        eventName: 'membership.agent_attribution_recorded',
        eventVersion: 1,
        payload: {
          ownershipSource: 'checkout.customData.agentId',
          readScopeGranted: false,
        },
        tenantId: 'tenant_1',
      })
    );
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
