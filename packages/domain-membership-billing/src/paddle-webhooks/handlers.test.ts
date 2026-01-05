import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSubscriptionChanged } from './handlers/subscriptions';
import { handleTransactionCompleted } from './handlers/transaction';

// Mock dependencies
const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
      subscriptions: { findFirst: vi.fn() },
      tenantSettings: { findFirst: vi.fn() },
    },
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) })),
  },
  subscriptions: { id: 'id_col' },
}));

vi.mock('@interdomestik/database', () => ({
  db: hoisted.db,
  subscriptions: hoisted.subscriptions,
}));

vi.mock('../../commissions/create', () => ({
  createCommissionCore: vi.fn(),
}));

describe('Paddle Webhook Handlers', () => {
  const logAuditEvent = vi.fn();
  const sendThankYouLetter = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
