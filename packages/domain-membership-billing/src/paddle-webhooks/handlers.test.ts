import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSubscriptionChanged } from './handlers/subscriptions';
import { handleTransactionCompleted } from './handlers/transaction';

// Mock dependencies
const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
      account: { findFirst: vi.fn() },
      subscriptions: { findFirst: vi.fn() },
      tenantSettings: { findFirst: vi.fn() },
      webhookEvents: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) })),
  },
  subscriptions: { id: 'id_col' },
  user: { id: 'user.id' },
  tx: {
    insert: vi.fn(),
    update: vi.fn(),
  },
  insertedUserValues: vi.fn(),
  updatedUserValues: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
  subscriptions: hoisted.subscriptions,
  user: hoisted.user,
}));

vi.mock('../../commissions/create', () => ({
  createCommissionCore: vi.fn(),
}));

vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumber: vi.fn().mockResolvedValue({ memberNumber: 'MEM-2026-000123', isNew: true }),
}));

describe('Paddle Webhook Handlers', () => {
  const logAuditEvent = vi.fn();
  const sendThankYouLetter = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));
    hoisted.tx.insert.mockImplementation(() => ({
      values: hoisted.insertedUserValues,
    }));
    hoisted.insertedUserValues.mockResolvedValue(undefined);
    hoisted.tx.update.mockImplementation(() => ({
      set: hoisted.updatedUserValues,
    }));
    hoisted.updatedUserValues.mockReturnValue({
      where: async () => undefined,
    });
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
      expect(hoisted.db.transaction).toHaveBeenCalledTimes(1);
      expect(hoisted.db.insert).toHaveBeenCalled();
    });
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

    it('uses customData tenant and attribution metadata for anonymous transactions', async () => {
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

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment.processed',
          entityId: 'tx_anon',
          tenantId: 'tenant_mk',
          metadata: expect.objectContaining({
            acquisitionSource: 'self_serve_web',
            agentId: 'agent_9',
            customerEmail: 'buyer@example.com',
            customerId: 'ctm_123',
            subscriptionId: 'sub_anon',
            utmSource: 'google',
            utmCampaign: 'diaspora',
          }),
        })
      );
      expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    });

    it('prefers persisted subscription tenant over client-provided tenant metadata', async () => {
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

      expect(logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_real',
        })
      );
      expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    });
  });
});
