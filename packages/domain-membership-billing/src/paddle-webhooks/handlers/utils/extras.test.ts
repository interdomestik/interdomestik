import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionCore } from '../../../commissions/create';
import { createRenewalCommissionCore } from '../../../commissions/create-renewal';
import {
  handleNewSubscriptionExtras,
  handleRenewalSubscriptionExtras,
  redactEmail,
} from './extras';

// Mock dependencies
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
  and: vi.fn((...parts) => ({ op: 'and', parts })),
  eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'agent-client-id'),
}));

vi.mock('../../../../../domain-referrals/src', () => ({
  createMemberReferralRewardCore: vi.fn(),
}));

vi.mock('../../../commissions/create', () => ({
  createCommissionCore: vi.fn(),
}));

vi.mock('../../../commissions/create-renewal', () => ({
  createRenewalCommissionCore: vi.fn(),
}));

describe('extras', () => {
  describe('redactEmail', () => {
    it('should handle undefined/null/empty', () => {
      expect(redactEmail(undefined)).toBe('unknown');
      expect(redactEmail(null)).toBe('unknown');
      expect(redactEmail('')).toBe('unknown');
    });

    it('should handle invalid email formats', () => {
      expect(redactEmail('invalid')).toBe('unknown');
    });

    it('should mask short local parts', () => {
      expect(redactEmail('a@b.com')).toBe('a*@b.com');
      expect(redactEmail('ab@b.com')).toBe('a*@b.com');
    });

    it('should mask longer local parts', () => {
      expect(redactEmail('john.doe@example.com')).toBe('j***e@example.com');
      expect(redactEmail('alice@test.com')).toBe('a***e@test.com');
    });
  });

  describe('handleNewSubscriptionExtras', () => {
    const mockDeps = {
      logAuditEvent: vi.fn(),
      sendThankYouLetter: vi.fn(),
    };

    const mockSub = {
      id: 'sub_123',
      items: [{ price: { unitPrice: { amount: '2000', currencyCode: 'EUR' } } }],
      currentBillingPeriod: { endsAt: '2025-01-01T00:00:00Z' },
    };

    const mockUserRecord = {
      email: 'test@example.com',
      name: 'Test Member',
      memberNumber: 'M-123',
    };
    const tx = {
      insert: vi.fn(),
      update: vi.fn(),
    };
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
      (createCommissionCore as any).mockResolvedValue({ success: true, data: { id: 'comm_1' } });
      (db.query.referrals.findFirst as any).mockResolvedValue(null);
      (createMemberReferralRewardCore as any).mockResolvedValue({
        success: true,
        data: { kind: 'no-op', created: false, reason: 'no_referral' },
      });
    });

    it('should process commission if agentId is present', async () => {
      const customData = { agentId: 'agent_1' };

      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData,
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
        })
      );
      expect(mockDeps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'commission.created',
        })
      );
      expect(db.transaction).toHaveBeenCalled();
      expect(tx.update).toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalled();
    });

    it('should use custom commission rates if found', async () => {
      (db.query.agentSettings.findFirst as any).mockResolvedValue({
        commissionRates: { new_membership: 0.5 }, // 50% custom rate
      });
      const customData = { agentId: 'agent_1' };

      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData,
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

    it('should skip commission if no agentId', async () => {
      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(createCommissionCore).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('deactivates prior agent bindings before reactivating the requested agent-client link', async () => {
      await handleNewSubscriptionExtras({
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
      expect(tx.insert).toHaveBeenCalled();
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: expect.any(Array),
          set: expect.objectContaining({
            status: 'active',
            joinedAt: expect.any(Date),
          }),
        })
      );
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

      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
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
      await handleNewSubscriptionExtras({
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

    it('should send thank you letter', async () => {
      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });

      expect(mockDeps.sendThankYouLetter).toHaveBeenCalledWith(
        expect.objectContaining({
          email: mockUserRecord.email,
          planPrice: '€20.00',
        })
      );
    });

    it('should handle missing thank you letter dep gracefully', async () => {
      const noLetterDeps = { ...mockDeps, sendThankYouLetter: undefined };
      // @ts-ignore
      await expect(
        handleNewSubscriptionExtras({
          sub: mockSub,
          userId: 'user_1',
          tenantId: 'tenant_1',
          customData: undefined,
          priceId: 'price_1',
          userRecord: mockUserRecord,
          deps: noLetterDeps,
        })
      ).resolves.toBeUndefined();
      // Should not throw
    });

    it('should handle thank you letter error gracefully', async () => {
      mockDeps.sendThankYouLetter.mockRejectedValue(new Error('Send failed'));
      // Should not throw
      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await handleNewSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
        priceId: 'price_1',
        userRecord: mockUserRecord,
        deps: mockDeps,
      });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('handleRenewalSubscriptionExtras', () => {
    const mockDeps = {
      logAuditEvent: vi.fn(),
    };

    const mockSub = {
      id: 'sub_renewal',
      items: [
        { price: { id: 'price_renewal', unitPrice: { amount: '3000', currencyCode: 'EUR' } } },
      ],
      customData: { agentId: 'agent_current' },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      (createRenewalCommissionCore as any).mockResolvedValue({
        success: true,
        data: { kind: 'created', id: 'renew_1' },
      });
    });

    it('creates a renewal commission using canonical ownership metadata', async () => {
      await handleRenewalSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_current' },
        priceId: 'price_renewal',
        userRecord: null,
        ownership: {
          subscriptionAgentId: 'agent_current',
          userAgentId: 'agent_previous',
          agentClientAgentIds: ['agent_current'],
          originalSellerAgentId: 'agent_original',
        },
        deps: mockDeps,
      });

      expect(createRenewalCommissionCore).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionAgentId: 'agent_current',
          userAgentId: 'agent_previous',
          agentClientAgentIds: ['agent_current'],
          originalSellerAgentId: 'agent_original',
          subscriptionId: 'sub_renewal',
          tenantId: 'tenant_1',
        })
      );
    });

    it('does not create a commission for company-owned renewals', async () => {
      await handleRenewalSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
        priceId: 'price_renewal',
        userRecord: null,
        ownership: {
          subscriptionAgentId: null,
          userAgentId: 'agent_previous',
          agentClientAgentIds: [],
          originalSellerAgentId: null,
        },
        deps: mockDeps,
      });

      expect(createRenewalCommissionCore).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionAgentId: null,
          userAgentId: 'agent_previous',
          agentClientAgentIds: [],
          originalSellerAgentId: null,
        })
      );
    });

    it('logs unresolved canonical ownership as an audit-visible skip instead of falling back to customData.agentId', async () => {
      (createRenewalCommissionCore as any).mockResolvedValue({
        success: true,
        data: {
          kind: 'no-op',
          noCommissionReason: 'unresolved',
          ownerType: 'unresolved',
          ownershipDiagnostics: [
            {
              source: 'subscription.agentId',
              expectedAgentId: null,
              actualAgentId: null,
            },
          ],
        },
      });

      await handleRenewalSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: { agentId: 'agent_current' },
        priceId: 'price_renewal',
        userRecord: null,
        ownership: {
          subscriptionAgentId: undefined,
          userAgentId: 'agent_previous',
          agentClientAgentIds: ['agent_previous'],
          originalSellerAgentId: 'agent_original',
        },
        deps: mockDeps,
      });

      expect(createRenewalCommissionCore).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionAgentId: undefined,
          userAgentId: 'agent_previous',
          agentClientAgentIds: ['agent_previous'],
          originalSellerAgentId: 'agent_original',
        })
      );
      expect(mockDeps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'commission.unresolved',
          metadata: expect.objectContaining({
            noCommissionReason: 'unresolved',
          }),
        })
      );
    });

    it('never creates a member referral reward on renewal flows', async () => {
      await handleRenewalSubscriptionExtras({
        sub: mockSub,
        userId: 'user_1',
        tenantId: 'tenant_1',
        customData: undefined,
        priceId: 'price_renewal',
        userRecord: null,
        ownership: {
          subscriptionAgentId: null,
          userAgentId: null,
          agentClientAgentIds: [],
          originalSellerAgentId: null,
        },
        deps: mockDeps,
      });

      expect(createMemberReferralRewardCore).not.toHaveBeenCalled();
    });
  });
});
