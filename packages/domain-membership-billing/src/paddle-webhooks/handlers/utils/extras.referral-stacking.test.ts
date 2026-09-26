import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionWithDispositionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

vi.mock('@interdomestik/database', () => ({
  agentClients: { tenantId: 'tenantId', memberId: 'memberId', agentId: 'agentId' },
  db: {
    transaction: vi.fn(),
    query: {
      agentSettings: { findFirst: vi.fn() },
      referrals: { findFirst: vi.fn() },
    },
  },
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  and: vi.fn(),
  eq: vi.fn(),
}));
vi.mock('../../../../../domain-referrals/src', () => ({
  createMemberReferralRewardCore: vi.fn(),
}));
vi.mock('../../../commissions/create', () => ({ createCommissionWithDispositionCore: vi.fn() }));

describe('new-subscription reward stacking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.query.agentSettings.findFirst as any).mockResolvedValue(null);
    (db.query.referrals.findFirst as any).mockResolvedValue({ id: 'ref_1' });
    (db.transaction as any).mockImplementation(async (callback: (transaction: any) => unknown) =>
      callback({
        insert: vi.fn(),
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
      })
    );
    (createCommissionWithDispositionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm_1', created: true },
    });
  });

  it('does not stack a member referral reward on top of an agent commission', async () => {
    await handleNewSubscriptionExtras({
      eventType: 'subscription.created',
      sub: {
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
      },
      userId: 'user_1',
      tenantId: 'tenant_1',
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: {
        email: 'test@example.com',
        name: 'Test Member',
        memberNumber: 'M-123',
      },
      deps: {
        logAuditEvent: vi.fn(),
      },
    });

    expect(createCommissionWithDispositionCore).toHaveBeenCalled();
    expect(createMemberReferralRewardCore).not.toHaveBeenCalled();
  });
});
