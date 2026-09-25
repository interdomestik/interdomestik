import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    tenantId: 'agentClients.tenantId',
    memberId: 'agentClients.memberId',
    agentId: 'agentClients.agentId',
  },
  db: {
    transaction: vi.fn(),
    query: {
      agentSettings: {
        findFirst: vi.fn(),
      },
      referrals: {
        findFirst: vi.fn(),
      },
    },
  },
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  and: vi.fn((...parts) => ({ op: 'and', parts })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
}));

vi.mock('../../../../../domain-referrals/src', () => ({
  createMemberReferralRewardCore: vi.fn(),
}));

vi.mock('../../../commissions/create', () => ({
  createCommissionCore: vi.fn(),
}));

describe('extras', () => {
  describe('handleNewSubscriptionExtras', () => {
    const handleCreatedSubscriptionExtras = (
      args: Omit<Parameters<typeof handleNewSubscriptionExtras>[0], 'eventType'>
    ) => handleNewSubscriptionExtras({ eventType: 'subscription.created', ...args });
    const mockDeps = {
      logAuditEvent: vi.fn(),
      sendThankYouLetter: vi.fn(),
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
    const tx = { insert: vi.fn(), update: vi.fn() };
    const insertValues = vi.fn();
    const onConflictDoUpdate = vi.fn();
    const updateWhere = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      // Default success mocks
      (db.query.agentSettings.findFirst as any).mockResolvedValue(null);
      mockDeps.sendThankYouLetter.mockResolvedValue({ success: true });
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
      (createCommissionCore as any).mockResolvedValue({ success: true, data: { id: 'comm_1' } });
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
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_1' },
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(db.query.agentSettings.findFirst).toHaveBeenCalled();
      expect(createCommissionCore).toHaveBeenCalledWith(
        expect.objectContaining({
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
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_1' },
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(createCommissionCore).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10, // 50% of 20
        })
      );
    });

    it('prefers the canonical user owner over stale webhook agent attribution', async () => {
      await handleCreatedSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_stale' },
        priceId: 'price_1',
        userRecord: {
          ...mockUserRecord,
          agentId: 'agent_canonical',
        },
        deps: mockDeps,
      });

      expect(createCommissionCore).toHaveBeenCalledWith(
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
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_stale' },
        priceId: 'price_1',
        userRecord: {
          ...mockUserRecord,
          agentId: null,
        },
        deps: mockDeps,
      });

      expect(createCommissionCore).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
      expect(createMemberReferralRewardCore).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_1',
          subscriptionId: 'sub_123',
        })
      );
    });

    it('should skip commission if no agentId', async () => {
      await handleCreatedSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { locale: 'en' },
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(createCommissionCore).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('records read-only attribution without reactivating agent-client read-scope links', async () => {
      await handleCreatedSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_1' },
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(db.transaction).toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalled();
      expect(updateWhere).toHaveBeenCalled();
      expect(tx.insert).not.toHaveBeenCalled();
      expect(onConflictDoUpdate).not.toHaveBeenCalled();
    });

    it('creates a member referral reward for a first paid subscription without an agent commission', async () => {
      (db.query.referrals.findFirst as any).mockResolvedValue({ id: 'ref_1' });
      (createMemberReferralRewardCore as any).mockResolvedValue({
        success: true,
        data: {
          kind: 'created',
          created: true,
          id: 'reward_1',
          rewardCents: 500,
          status: 'pending',
          rewardType: 'fixed',
          currencyCode: 'EUR',
        },
      });

      await handleCreatedSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { locale: 'en' },
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(createCommissionCore).not.toHaveBeenCalled();
      expect(createMemberReferralRewardCore).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_1',
          referralId: 'ref_1',
          subscriptionId: 'sub_123',
          qualifyingEventType: 'first_paid_membership',
          paymentAmountCents: 2000,
        })
      );
      expect(mockDeps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'referral.reward.created',
          entityType: 'referral_reward',
        })
      );
    });

    it('does not stack a member referral reward on top of an agent commission', async () => {
      await handleCreatedSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_1' },
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(createCommissionCore).toHaveBeenCalled();
      expect(createMemberReferralRewardCore).not.toHaveBeenCalled();
    });
  });
});
