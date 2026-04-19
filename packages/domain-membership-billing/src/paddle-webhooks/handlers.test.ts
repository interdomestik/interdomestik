import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueuedFrom } from '../../../../scripts/tests/queued-select-mock';
import { handleSubscriptionPastDue } from './handlers/dunning';
import { handleSubscriptionChanged } from './handlers/subscriptions';
import { handleTransactionCompleted } from './handlers/transaction';

// Mock dependencies
const hoisted = vi.hoisted(() => ({
  db: {
    query: {
      user: { findFirst: vi.fn() },
      account: { findFirst: vi.fn() },
      agentClients: { findFirst: vi.fn() },
      membershipPlans: { findFirst: vi.fn() },
      subscriptions: { findFirst: vi.fn() },
      tenantSettings: { findFirst: vi.fn() },
      webhookEvents: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn() })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
  selectResults: [] as unknown[][],
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  asc: vi.fn((value: unknown) => ({ op: 'asc', value })),
  subscriptions: { id: 'id_col' },
  user: { id: 'user.id' },
  membershipPlans: {
    id: 'membership_plans.id',
    tenantId: 'membership_plans.tenant_id',
    tier: 'membership_plans.tier',
    paddlePriceId: 'membership_plans.paddle_price_id',
    interval: 'membership_plans.interval',
    isActive: 'membership_plans.is_active',
  },
  tx: {
    insert: vi.fn(),
    update: vi.fn(),
  },
  insertedUserValues: vi.fn(),
  updatedUserValues: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: {
    tenantId: 'agent_clients.tenant_id',
    memberId: 'agent_clients.member_id',
    agentId: 'agent_clients.agent_id',
  },
  and: hoisted.and,
  asc: hoisted.asc,
  db: hoisted.db,
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  membershipPlans: hoisted.membershipPlans,
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
    hoisted.selectResults.length = 0;
    hoisted.db.select.mockImplementation(() => ({
      from: createQueuedFrom(vi.fn, hoisted.selectResults),
    }));
    hoisted.db.transaction.mockImplementation(async callback => callback(hoisted.tx));
    hoisted.db.insert.mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    }));
    hoisted.db.query.agentClients.findFirst.mockResolvedValue(null);
    hoisted.db.query.membershipPlans.findFirst.mockResolvedValue(null);
    hoisted.db.update.mockImplementation(() => ({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }));
    hoisted.tx.insert.mockImplementation(() => ({
      values: hoisted.insertedUserValues,
    }));
    hoisted.insertedUserValues.mockReturnValue({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    });
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
      expect(hoisted.db.transaction).toHaveBeenCalledTimes(2);
      expect(hoisted.db.insert).toHaveBeenCalled();
    });

    it('throws when a valid subscription event cannot resolve tenant context', async () => {
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
          { logAuditEvent }
        )
      ).rejects.toThrow('Unable to resolve subscription context');

      expect(hoisted.db.insert).not.toHaveBeenCalled();
      expect(logAuditEvent).not.toHaveBeenCalled();
    });

    it('updates an existing user-scoped subscription row instead of inserting a second row', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      hoisted.db.update.mockReturnValue({ set: mockSet });

      hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'mock_sub_existing',
        tenantId: 'tenant_abc',
        userId: 'user_123',
      });
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        tenantId: 'tenant_abc',
      });

      await handleSubscriptionChanged(
        {
          eventType: 'subscription.updated',
          data: {
            id: 'sub_paddle_456',
            status: 'active',
            customData: { userId: 'user_123' },
            items: [
              {
                price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { logAuditEvent }
      );

      expect(hoisted.db.insert).not.toHaveBeenCalled();
      expect(hoisted.db.update).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          providerSubscriptionId: 'sub_paddle_456',
        })
      );
      expect(mockWhere).toHaveBeenCalled();
    });

    it('stores the canonical annual plan id instead of the Paddle price id', async () => {
      const insertedValues = vi.fn().mockResolvedValue(undefined);

      hoisted.db.insert.mockReturnValue({
        values: insertedValues,
      });
      hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        tenantId: 'tenant_mk',
      });
      hoisted.selectResults.push([], [{ id: 'mk-standard-plan', tier: 'standard' }]);

      await handleSubscriptionChanged(
        {
          eventType: 'subscription.updated',
          data: {
            id: 'sub_paddle_annual',
            status: 'active',
            customData: { userId: 'user_123' },
            items: [
              {
                price: {
                  id: 'pri_standard_year_mk',
                  unitPrice: { amount: '2000', currencyCode: 'EUR' },
                },
              },
            ],
            currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
          },
        },
        { logAuditEvent }
      );

      expect(insertedValues).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'standard',
          planKey: 'mk-standard-plan',
        })
      );
    });

    it('retries as an update when a raced insert hits a unique constraint', async () => {
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });

      hoisted.db.update.mockReturnValue({ set: mockSet });
      hoisted.db.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(uniqueViolation),
      });
      hoisted.db.query.subscriptions.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'mock_sub_existing',
          tenantId: 'tenant_abc',
          userId: 'user_123',
        });
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        tenantId: 'tenant_abc',
      });

      await handleSubscriptionChanged(
        {
          eventType: 'subscription.updated',
          data: {
            id: 'sub_paddle_456',
            status: 'active',
            customData: { userId: 'user_123' },
            items: [
              {
                price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { logAuditEvent }
      );

      expect(hoisted.db.insert).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          providerSubscriptionId: 'sub_paddle_456',
        })
      );
      expect(mockWhere).toHaveBeenCalled();
    });

    it('prefers the reconciled user agent over webhook customData when persisting subscription ownership', async () => {
      const insertedValues = vi.fn().mockResolvedValue(undefined);

      hoisted.db.insert.mockReturnValue({
        values: insertedValues,
      });
      hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
      hoisted.db.query.user.findFirst
        .mockResolvedValueOnce({
          tenantId: 'tenant_abc',
          email: 'test@example.com',
          name: 'Test User',
          memberNumber: 'MEM-2026-000001',
          agentId: 'agent_user',
        })
        .mockResolvedValueOnce({
          branchId: 'branch_abc',
        });

      await handleSubscriptionChanged(
        {
          eventType: 'subscription.updated',
          data: {
            id: 'sub_agent_owner',
            status: 'active',
            customData: { userId: 'user_123', agentId: 'agent_stale' },
            items: [
              {
                price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { logAuditEvent }
      );

      expect(insertedValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_123',
          agentId: 'agent_user',
        })
      );
    });
  });

  describe('handleSubscriptionPastDue', () => {
    it('sends the payment failed email on the first dunning attempt', async () => {
      const sendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);

      hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Member',
        tenantId: 'tenant_abc',
      });

      await handleSubscriptionPastDue(
        {
          data: {
            id: 'sub_paddle_456',
            status: 'past_due',
            customData: { userId: 'user_123' },
            items: [
              {
                price: {
                  id: 'pri_123',
                  description: 'Asistenca',
                  unitPrice: { amount: '1000', currencyCode: 'USD' },
                },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { sendPaymentFailedEmail }
      );

      expect(sendPaymentFailedEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          memberName: 'Member',
          planName: 'Asistenca',
          gracePeriodDays: 14,
        })
      );
    });

    it('does not resend the payment failed email after the first dunning attempt', async () => {
      const sendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);

      hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce({
        id: 'sub_existing',
        tenantId: 'tenant_abc',
        userId: 'user_123',
        dunningAttemptCount: 1,
      });
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Member',
        tenantId: 'tenant_abc',
      });

      await handleSubscriptionPastDue(
        {
          data: {
            id: 'sub_paddle_456',
            status: 'past_due',
            customData: { userId: 'user_123' },
            items: [
              {
                price: {
                  id: 'pri_123',
                  description: 'Asistenca',
                  unitPrice: { amount: '1000', currencyCode: 'USD' },
                },
              },
            ],
            currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
          },
        },
        { sendPaymentFailedEmail }
      );

      expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
    });

    it('retries as an update when a raced insert hits a unique constraint', async () => {
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });

      hoisted.db.update.mockReturnValue({ set: mockSet });
      hoisted.db.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(uniqueViolation),
      });
      hoisted.db.query.subscriptions.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'mock_sub_existing',
          tenantId: 'tenant_abc',
          userId: 'user_123',
          dunningAttemptCount: 0,
        });
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Member',
        tenantId: 'tenant_abc',
      });

      await handleSubscriptionPastDue({
        data: {
          id: 'sub_paddle_456',
          status: 'past_due',
          customData: { userId: 'user_123' },
          items: [
            {
              price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
            },
          ],
          currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
        },
      });

      expect(hoisted.db.insert).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          providerSubscriptionId: 'sub_paddle_456',
          status: 'past_due',
        })
      );
      expect(mockWhere).toHaveBeenCalled();
    });

    it('normalizes past-due subscriptions to the canonical annual plan id', async () => {
      const insertedValues = vi.fn().mockResolvedValue(undefined);

      hoisted.db.insert.mockReturnValue({
        values: insertedValues,
      });
      hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
      hoisted.db.query.user.findFirst.mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        name: 'Member',
        tenantId: 'tenant_mk',
      });
      hoisted.selectResults.push([], [{ id: 'mk-family-plan', tier: 'family' }]);

      await handleSubscriptionPastDue({
        data: {
          id: 'sub_paddle_annual',
          status: 'past_due',
          customData: { userId: 'user_123' },
          items: [
            {
              price: {
                id: 'pri_family_year_mk',
                description: 'Asistenca Family',
                unitPrice: { amount: '3000', currencyCode: 'EUR' },
              },
            },
          ],
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      });

      expect(insertedValues).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'family',
          planKey: 'mk-family-plan',
        })
      );
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

    it('resolves transaction tenant from provider subscription id lookups', async () => {
      hoisted.db.query.subscriptions.findFirst.mockImplementationOnce(
        async (args: {
          where?: (
            subs: Record<string, string>,
            operators: {
              eq: (left: unknown, right: unknown) => unknown;
              or: (...clauses: unknown[]) => unknown;
            }
          ) => unknown;
        }) => {
          const whereNode = args.where?.(
            {
              id: 'subscriptions.id',
              providerSubscriptionId: 'subscriptions.provider_subscription_id',
            },
            {
              eq: (left, right) => ({ op: 'eq', left, right }),
              or: (...clauses) => ({ op: 'or', clauses }),
            }
          ) as
            | {
                op?: string;
                clauses?: Array<{ op?: string; left?: unknown; right?: unknown }>;
              }
            | undefined;

          expect(whereNode).toEqual({
            op: 'or',
            clauses: [
              { op: 'eq', left: 'subscriptions.id', right: 'sub_provider_456' },
              {
                op: 'eq',
                left: 'subscriptions.provider_subscription_id',
                right: 'sub_provider_456',
              },
            ],
          });

          return { tenantId: 'tenant_real' };
        }
      );

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
});
