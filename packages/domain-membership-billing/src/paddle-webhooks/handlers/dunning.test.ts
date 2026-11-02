import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionPastDue } from './dunning';
import {
  TEST_PADDLE_DELIVERY,
  createPastDueSubscriptionEvent,
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
  it('sends the payment failed email on the first dunning attempt', async () => {
    const sendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);

    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce(null);
    mockUserOwner(hoisted, 'tenant_abc');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Member',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionPastDue(createPastDueSubscriptionEvent(), { sendPaymentFailedEmail });

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

    mockSubscriptionOwner(hoisted, { subscriptionId: 'sub_existing', tenantId: 'tenant_abc' });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValueOnce({
      id: 'sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_123',
      dunningAttemptCount: 1,
    });
    mockUserOwner(hoisted, 'tenant_abc');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Member',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionPastDue(createPastDueSubscriptionEvent(), { sendPaymentFailedEmail });

    expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
  });

  it('uses existing subscription user when past-due customData omits userId', async () => {
    const sendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);

    mockSubscriptionOwner(hoisted, { subscriptionId: 'sub_existing', tenantId: 'tenant_abc' });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_abc',
      userId: 'user_canonical',
      dunningAttemptCount: 0,
    });
    mockUserOwner(hoisted, 'tenant_abc');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_canonical',
      email: 'canonical@example.com',
      name: 'Canonical',
      tenantId: 'tenant_abc',
    });

    await handleSubscriptionPastDue(
      {
        delivery: TEST_PADDLE_DELIVERY,
        data: {
          id: 'sub_paddle_456',
          status: 'past_due',
          customData: { tenantId: 'tenant_abc' },
          items: [
            {
              price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
            },
          ],
          currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
        },
      },
      { sendPaymentFailedEmail }
    );

    expect(sendPaymentFailedEmail).toHaveBeenCalledWith(
      'canonical@example.com',
      expect.objectContaining({ memberName: 'Canonical' })
    );
  });

  it('skips dunning writes when provider tenant metadata conflicts with canonical tenant', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sendPaymentFailedEmail = vi.fn().mockResolvedValue(undefined);

    mockSubscriptionOwner(hoisted, { subscriptionId: 'sub_existing', tenantId: 'tenant_real' });
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue({
      id: 'sub_existing',
      tenantId: 'tenant_real',
      userId: 'user_123',
      dunningAttemptCount: 0,
    });
    mockUserOwner(hoisted, 'tenant_real');
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Member',
      tenantId: 'tenant_real',
    });

    await handleSubscriptionPastDue(
      {
        delivery: TEST_PADDLE_DELIVERY,
        data: {
          id: 'sub_paddle_456',
          status: 'past_due',
          customData: { userId: 'user_123', tenantId: 'tenant_bad' },
          items: [
            {
              price: { id: 'pri_123', unitPrice: { amount: '1000', currencyCode: 'USD' } },
            },
          ],
          currentBillingPeriod: { startsAt: '2023-01-01', endsAt: '2024-01-01' },
        },
      },
      { sendPaymentFailedEmail }
    );

    expect(hoisted.db.insert).not.toHaveBeenCalled();
    expect(hoisted.db.update).not.toHaveBeenCalled();
    expect(sendPaymentFailedEmail).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('customData tenant=tenant_bad'));

    warnSpy.mockRestore();
  });
});
