import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommissionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras, redactEmail } from './extras';

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      agentSettings: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('../../../commissions/create', () => ({
  createCommissionCore: vi.fn(),
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

    beforeEach(() => {
      vi.clearAllMocks();
      // Default success mocks
      (db.query.agentSettings.findFirst as any).mockResolvedValue(null);
      (createCommissionCore as any).mockResolvedValue({ success: true, data: { id: 'comm_1' } });
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
});
