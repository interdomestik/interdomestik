import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMemberReferralStatsCore } from './stats';

type ReferralCountRow = { count: number };

vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(),
    query: {
      referrals: {
        findMany: vi.fn(() => {
          throw new Error('referrals.findMany should not be called');
        }),
      },
      memberReferralRewards: {
        findMany: vi.fn(),
      },
      memberReferralSettings: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  referrals: {
    tenantId: 'tenantId',
    referrerId: 'referrerId',
  },
  memberReferralRewards: {
    tenantId: 'tenantId',
    referrerMemberId: 'referrerMemberId',
    status: 'status',
    rewardCents: 'rewardCents',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args) => args),
  count: vi.fn(() => 'count()'),
  eq: vi.fn((left, right) => [left, right]),
}));

vi.mock('./settings', () => ({
  getMemberReferralProgramSettingsCore: vi.fn(),
}));

describe('getMemberReferralStatsCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses an aggregate referral count and includes approved rewards in the pending bucket', async () => {
    const referralCountWhere = vi.fn().mockResolvedValue([{ count: 7 }]);
    const referralCountFrom = vi.fn(() => ({ where: referralCountWhere }));
    vi.mocked(db.select).mockReturnValue({
      from: referralCountFrom,
    } as never);
    vi.mocked(db.query.memberReferralRewards.findMany).mockResolvedValue([
      { status: 'pending', rewardCents: 100 },
      { status: 'approved', rewardCents: 200 },
      { status: 'credited', rewardCents: 400 },
      { status: 'paid', rewardCents: 500 },
    ] as never);

    const { getMemberReferralProgramSettingsCore } = await import('./settings');
    vi.mocked(getMemberReferralProgramSettingsCore).mockResolvedValue({
      success: true,
      data: {
        tenantId: 'tenant-1',
        enabled: true,
        rewardType: 'fixed',
        fixedRewardCents: 500,
        percentRewardBps: null,
        settlementMode: 'credit_or_payout',
        payoutThresholdCents: 1000,
        fraudReviewEnabled: false,
        currencyCode: 'EUR',
        qualifyingEventType: 'first_paid_membership',
      },
    } as never);

    const result = await getMemberReferralStatsCore({
      session: { user: { id: 'member-a', role: 'user', tenantId: 'tenant-1' } } as any,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        totalReferred: 7,
        pendingRewards: 3,
        creditedRewards: 4,
        payoutEligibleRewards: 0,
        paidRewards: 5,
        rewardsCurrency: 'EUR',
      });
    }

    expect(db.query.referrals.findMany).not.toHaveBeenCalled();
    expect(db.select).toHaveBeenCalledWith({ count: 'count()' });
    expect(referralCountFrom).toHaveBeenCalledTimes(1);
    expect(referralCountWhere).toHaveBeenCalledTimes(1);
  });
});
