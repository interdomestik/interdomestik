import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMemberReferralStatsCore } from './stats';
import { createMemberReferralRewardCore } from './rewards';

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      referrals: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      memberReferralSettings: {
        findFirst: vi.fn(),
      },
      memberReferralRewards: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(),
        })),
        returning: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  referrals: {
    id: 'id',
    tenantId: 'tenantId',
    referrerId: 'referrerId',
    referredId: 'referredId',
  },
  memberReferralSettings: {
    tenantId: 'tenantId',
  },
  memberReferralRewards: {
    tenantId: 'tenantId',
    subscriptionId: 'subscriptionId',
    qualifyingEventType: 'qualifyingEventType',
    qualifyingEventId: 'qualifyingEventId',
    referrerMemberId: 'referrerMemberId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((left, right) => [left, right]),
  and: vi.fn((...args) => args),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'reward-1'),
}));

describe('createMemberReferralRewardCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not earn a reward for a direct online signup', async () => {
    (db.query.memberReferralSettings.findFirst as any).mockResolvedValue({
      tenantId: 'tenant-1',
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 500,
      percentRewardBps: null,
      referredMemberRewardType: 'fixed',
      referredMemberFixedRewardCents: 0,
      referredMemberPercentRewardBps: null,
      settlementMode: 'credit_only',
      payoutThresholdCents: 0,
      fraudReviewEnabled: false,
      currencyCode: 'EUR',
      qualifyingEventType: 'first_paid_membership',
    });

    const result = await createMemberReferralRewardCore({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      qualifyingEventId: 'evt-1',
      qualifyingEventType: 'first_paid_membership',
      paymentAmountCents: 2000,
      currencyCode: 'EUR',
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.kind === 'no-op') {
      expect(result.data.kind).toBe('no-op');
      expect(result.data.reason).toBe('no_referral');
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates exactly one reward for the first paid referral event', async () => {
    (db.query.memberReferralSettings.findFirst as any).mockResolvedValue({
      tenantId: 'tenant-1',
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 500,
      percentRewardBps: null,
      referredMemberRewardType: 'fixed',
      referredMemberFixedRewardCents: 0,
      referredMemberPercentRewardBps: null,
      settlementMode: 'credit_only',
      payoutThresholdCents: 0,
      fraudReviewEnabled: false,
      currencyCode: 'EUR',
      qualifyingEventType: 'first_paid_membership',
    });
    (db.query.referrals.findFirst as any).mockResolvedValue({
      id: 'ref-1',
      tenantId: 'tenant-1',
      referrerId: 'member-a',
      referredId: 'member-b',
      referralCode: 'CODE-1',
    });
    (db.query.memberReferralRewards.findFirst as any).mockResolvedValueOnce(null);
    (db.query.memberReferralRewards.findFirst as any).mockResolvedValueOnce({
      id: 'reward-1',
      tenantId: 'tenant-1',
      referralId: 'ref-1',
      subscriptionId: 'sub-1',
      referrerMemberId: 'member-a',
      referredMemberId: 'member-b',
      qualifyingEventId: 'evt-1',
      qualifyingEventType: 'first_paid_membership',
      rewardType: 'fixed',
      status: 'pending',
      rewardCents: 500,
      rewardPercentBps: null,
      currencyCode: 'EUR',
      metadata: {},
    });
    (db.insert as any).mockReturnValue({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'reward-1' }]),
        })),
        returning: vi.fn().mockResolvedValue([{ id: 'reward-1' }]),
      })),
    });

    const first = await createMemberReferralRewardCore({
      tenantId: 'tenant-1',
      referralId: 'ref-1',
      subscriptionId: 'sub-1',
      qualifyingEventId: 'evt-1',
      qualifyingEventType: 'first_paid_membership',
      paymentAmountCents: 2000,
      currencyCode: 'EUR',
    });

    const second = await createMemberReferralRewardCore({
      tenantId: 'tenant-1',
      referralId: 'ref-1',
      subscriptionId: 'sub-1',
      qualifyingEventId: 'evt-1',
      qualifyingEventType: 'first_paid_membership',
      paymentAmountCents: 2000,
      currencyCode: 'EUR',
    });

    expect(first.success).toBe(true);
    if (first.success && first.data.kind === 'created') {
      expect(first.data.kind).toBe('created');
      expect(first.data.id).toBe('reward-1');
    }
    expect(second.success).toBe(true);
    if (second.success && second.data.kind === 'existing') {
      expect(second.data.kind).toBe('existing');
      expect(second.data.id).toBe('reward-1');
    }
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('does not earn a reward on renewal events', async () => {
    const result = await createMemberReferralRewardCore({
      tenantId: 'tenant-1',
      referralId: 'ref-1',
      subscriptionId: 'sub-1',
      qualifyingEventId: 'evt-2',
      qualifyingEventType: 'renewal',
      paymentAmountCents: 2000,
      currencyCode: 'EUR',
    });

    expect(result.success).toBe(true);
    if (result.success && result.data.kind === 'no-op') {
      expect(result.data.kind).toBe('no-op');
      expect(result.data.reason).toBe('non_qualifying_event');
    }
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('exposes balances from the reward ledger', async () => {
    (db.query.memberReferralSettings.findFirst as any).mockResolvedValue({
      tenantId: 'tenant-1',
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 500,
      percentRewardBps: null,
      referredMemberRewardType: 'fixed',
      referredMemberFixedRewardCents: 0,
      referredMemberPercentRewardBps: null,
      settlementMode: 'credit_or_payout',
      payoutThresholdCents: 1000,
      fraudReviewEnabled: false,
      currencyCode: 'EUR',
      qualifyingEventType: 'first_paid_membership',
    });
    (db.query.referrals.findMany as any).mockResolvedValue([{ id: 'ref-1' }]);
    (db.query.memberReferralRewards.findMany as any).mockResolvedValue([
      { status: 'pending', rewardCents: 100 },
      { status: 'credited', rewardCents: 400 },
      { status: 'paid', rewardCents: 200 },
    ]);

    const result = await getMemberReferralStatsCore({
      session: { user: { id: 'member-a', role: 'user', tenantId: 'tenant-1' } } as any,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        totalReferred: 1,
        pendingRewards: 1,
        creditedRewards: 4,
        payoutEligibleRewards: 0,
        paidRewards: 2,
        rewardsCurrency: 'EUR',
      });
    }
  });
});
