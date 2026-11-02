import { authority } from './extras.test-support';
import { db, withTenantContext } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionWithDispositionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

describe('handleNewSubscriptionExtras', () => {
  const handleCreatedSubscriptionExtras = (
    args: Omit<Parameters<typeof handleNewSubscriptionExtras>[0], 'eventType'>
  ) =>
    handleNewSubscriptionExtras({
      eventType: 'subscription.created',
      ...args,
    });
  const mockDeps = {
    logAuditEvent: vi.fn(),
  };

  const mockSub = {
    id: 'sub_123',
    status: 'active',
    items: [
      {
        price: {
          name: 'Annual membership',
          unitPrice: { amount: '2000', currencyCode: 'EUR' },
        },
      },
    ],
    billingCycle: { frequency: 1, interval: 'year' },
    currentBillingPeriod: {
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
    },
  };

  const mockUserRecord = {
    email: 'test@example.com',
    name: 'Test Member',
    memberNumber: 'M-123',
  };
  // The tenant-context transaction also serves tenant-scoped reads through `tx.query`.
  const tx = { insert: vi.fn(), update: vi.fn(), query: db.query };
  const insertValues = vi.fn();
  const onConflictDoUpdate = vi.fn();
  const updateWhere = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Default success mocks
    (db.query.agentSettings.findFirst as any).mockResolvedValue(null);
    (db.transaction as any).mockImplementation(
      async (callback: (trx: typeof tx) => Promise<unknown> | unknown) => callback(tx)
    );
    tx.insert.mockImplementation(() => ({
      values: insertValues,
    }));
    insertValues.mockReturnValue({
      onConflictDoUpdate,
    });
    onConflictDoUpdate.mockResolvedValue(undefined);
    tx.update.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: updateWhere,
      }),
    }));
    updateWhere.mockResolvedValue(undefined);
    (createCommissionWithDispositionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm_1', created: true },
    });
    (db.query.referrals.findFirst as any).mockResolvedValue(null);
    (createMemberReferralRewardCore as any).mockResolvedValue({
      success: true,
      data: { kind: 'no-op', created: false, reason: 'no_referral' },
    });
  });

  it('should process commission if agentId is present', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(db.query.agentSettings.findFirst).toHaveBeenCalled();
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(createCommissionWithDispositionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        authority,
        agentId: 'agent_1',
        amount: 4, // 20% of 20.00 EUR default
        memberId: 'user_1',
        metadata: expect.objectContaining({
          saleOwnerType: 'agent',
          saleOwnerId: 'agent_1',
          originalSellerAgentId: 'agent_1',
          ownershipResolvedFrom: ['checkout.customData.agentId'],
        }),
      })
    );
    expect(mockDeps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'commission.created',
      })
    );
    expect(db.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('should use custom commission rates if found', async () => {
    (db.query.agentSettings.findFirst as any).mockResolvedValue({
      commissionRates: { new_membership: 0.5 }, // 50% custom rate
    });
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 10, // 50% of 20
      })
    );
  });

  it('prefers the canonical user owner over stale webhook agent attribution', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_stale' },
      priceId: 'price_1',
      userRecord: {
        ...mockUserRecord,
        agentId: 'agent_canonical',
      },
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent_canonical',
      })
    );
    expect(db.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('treats company-owned canonical users as company-owned even when webhook customData is stale', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_stale' },
      priceId: 'price_1',
      userRecord: {
        ...mockUserRecord,
        agentId: null,
      },
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    // The only tenant context left is the read-only referral lookup: no write statement ran.
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
    expect(createMemberReferralRewardCore).toHaveBeenCalledWith(
      expect.objectContaining({
        authority,
        subscriptionId: 'sub_123',
      })
    );
  });
});
