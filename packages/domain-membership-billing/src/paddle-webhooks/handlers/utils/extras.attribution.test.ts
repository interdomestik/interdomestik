import { authority } from './extras.test-support';
import { db, withTenantContext } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberReferralRewardCore } from '../../../../../domain-referrals/src';
import { createCommissionWithDispositionCore } from '../../../commissions/create';
import { handleNewSubscriptionExtras } from './extras';

describe('handleNewSubscriptionExtras', () => {
  const handleCreatedSubscriptionExtras = (
    args: Omit<Parameters<typeof handleNewSubscriptionExtras>[0], 'eventType'>
  ) =>
    handleNewSubscriptionExtras({
      eventType: 'subscription.created',
      ...args,
    });
  const mockDeps = {
    logAuditEvent: vi.fn(),
  };

  const mockSub = {
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
  };

  const mockUserRecord = {
    email: 'test@example.com',
    name: 'Test Member',
    memberNumber: 'M-123',
  };
  // The tenant-context transaction also serves tenant-scoped reads through `tx.query`.
  const tx = { insert: vi.fn(), update: vi.fn(), query: db.query };
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
    (createCommissionWithDispositionCore as any).mockResolvedValue({
      success: true,
      data: { id: 'comm_1', created: true },
    });
    (db.query.referrals.findFirst as any).mockResolvedValue(null);
    (createMemberReferralRewardCore as any).mockResolvedValue({
      success: true,
      data: { kind: 'no-op', created: false, reason: 'no_referral' },
    });
  });

  it('should skip commission if no agentId', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { locale: 'en' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    // The only tenant context left is the read-only referral lookup: no write statement ran.
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('records read-only attribution without reactivating agent-client read-scope links', async () => {
    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { agentId: 'agent_1' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(db.transaction).toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
    expect(onConflictDoUpdate).not.toHaveBeenCalled();
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

    await handleCreatedSubscriptionExtras({
      sub: mockSub,
      userId: 'user_1',
      authority,
      customData: { locale: 'en' },
      priceId: 'price_1',
      userRecord: mockUserRecord,
      deps: mockDeps,
    });

    expect(createCommissionWithDispositionCore).not.toHaveBeenCalled();
    expect(createMemberReferralRewardCore).toHaveBeenCalledWith(
      expect.objectContaining({
        authority,
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
});
