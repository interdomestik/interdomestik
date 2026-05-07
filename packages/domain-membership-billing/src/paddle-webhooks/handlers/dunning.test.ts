import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionPastDue } from './dunning';
import { resetPaddleHandlerMocks } from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');

  return createHoistedPaddleHandlerMocks();
});

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

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
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
