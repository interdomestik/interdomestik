import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionPastDue } from './dunning';
import {
  mockRacedSubscriptionInsert,
  mockSubscriptionOwner,
  mockUserOwner,
  resetPaddleHandlerMocks,
  routeTenantContextToDbMock,
} from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');

  return createHoistedPaddleHandlerMocks();
});

vi.mock('@interdomestik/database', async function () {
  const support = await import('./test-support');
  return support.createPaddleDatabaseMockModule(hoisted);
});

vi.mock('../../commissions/create', async function () {
  const support = await import('./test-support');
  return support.createCommissionMockModule();
});

vi.mock('@interdomestik/database/member-number', async function () {
  const support = await import('./test-support');
  return support.createMemberNumberMockModule();
});

beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
  // Dunning persists through standalone tenant-scoped statements (no multi-write transaction).
  routeTenantContextToDbMock(hoisted);
});

describe('handleSubscriptionPastDue', () => {
  it('skips dunning writes when provider user metadata conflicts with existing subscription user', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockSubscriptionOwner(hoisted, { subscriptionId: 'sub_existing', tenantId: 'tenant_abc' });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_real',
      dunningAttemptCount: 0,
    });

    await handleSubscriptionPastDue({
      data: {
        id: 'sub_paddle_456',
        status: 'past_due',
        customData: { userId: 'user_bad', tenantId: 'tenant_abc' },
        items: [
          {
            price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
          },
        ],
        currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
      },
    });

    expect(hoisted.resolution.resolvePaddleUserOwner).not.toHaveBeenCalled();
    expect(hoisted.db.query.user.findFirst).not.toHaveBeenCalled();
    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(hoisted.db.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'customData user=user_bad conflicts with existing subscription user=user_real'
      )
    );

    warnSpy.mockRestore();
  });

  it('retries as an update when a raced insert hits a unique constraint', async () => {
    const { mockSet, mockWhere } = mockRacedSubscriptionInsert(hoisted);

    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'mock_sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_123',
      dunningAttemptCount: 0,
    });
    mockUserOwner(hoisted, 'tenant_abc');
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

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant_abc' },
      expect.any(Function)
    );
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
    mockUserOwner(hoisted, 'tenant_mk');
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
