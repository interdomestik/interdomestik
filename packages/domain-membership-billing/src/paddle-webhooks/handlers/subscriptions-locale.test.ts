import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSubscriptionChanged } from './subscriptions';
import { resetPaddleHandlerMocks } from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');
  return createHoistedPaddleHandlerMocks();
});

vi.mock('@interdomestik/database', async () =>
  (await import('./test-support')).createPaddleDatabaseMockModule(hoisted)
);
vi.mock('../../commissions/create', async () =>
  (await import('./test-support')).createCommissionMockModule()
);
vi.mock('@interdomestik/database/member-number', async () =>
  (await import('./test-support')).createMemberNumberMockModule()
);

describe('subscription locale isolation', () => {
  const sendThankYouLetter = vi.fn();

  beforeEach(() => {
    resetPaddleHandlerMocks(hoisted);
    hoisted.db.query.subscriptions.findFirst.mockResolvedValue(undefined);
    hoisted.db.query.user.findFirst.mockResolvedValue({
      id: 'user_123',
      email: 'member@example.test',
      name: 'Member One',
      memberNumber: 'MEM-2026-001',
      tenantId: 'tenant_mk',
    });
  });

  it('persists a paid subscription but withholds confirmation for an unsupported locale', async () => {
    await handleSubscriptionChanged(
      {
        eventType: 'subscription.created',
        data: {
          id: 'sub_unsupported_locale',
          status: 'active',
          customData: {
            userId: 'user_123',
            tenantId: 'tenant_mk',
            agentId: 'agent_1',
            locale: 'de',
          },
          items: [
            {
              price: {
                id: 'pri_123',
                name: 'Annual membership',
                unitPrice: { amount: '2000', currencyCode: 'EUR' },
              },
            },
          ],
          billingCycle: { frequency: 1, interval: 'year' },
          currentBillingPeriod: { startsAt: '2026-01-01', endsAt: '2027-01-01' },
        },
      },
      { sendThankYouLetter }
    );

    expect(hoisted.tx.insert).toHaveBeenCalled();
    expect(sendThankYouLetter).not.toHaveBeenCalled();
  });
});
