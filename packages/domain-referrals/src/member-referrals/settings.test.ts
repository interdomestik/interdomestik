import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMemberReferralProgramSettingsCore,
  upsertMemberReferralProgramSettingsCore,
} from './settings';

const insertValues = vi.fn();

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      memberReferralSettings: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: insertValues.mockImplementation(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  memberReferralSettings: {
    tenantId: 'tenantId',
    enabled: 'enabled',
    rewardType: 'rewardType',
    fixedRewardCents: 'fixedRewardCents',
    percentRewardBps: 'percentRewardBps',
    referredMemberRewardType: 'referredMemberRewardType',
    referredMemberFixedRewardCents: 'referredMemberFixedRewardCents',
    referredMemberPercentRewardBps: 'referredMemberPercentRewardBps',
    settlementMode: 'settlementMode',
    payoutThresholdCents: 'payoutThresholdCents',
    fraudReviewEnabled: 'fraudReviewEnabled',
    currencyCode: 'currencyCode',
    qualifyingEventType: 'qualifyingEventType',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((left, right) => [left, right]),
  and: vi.fn((...args) => args),
}));

describe('member referral settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns safe defaults when no settings row exists', async () => {
    (db.query.memberReferralSettings.findFirst as any).mockResolvedValue(null);

    const result = await getMemberReferralProgramSettingsCore({
      tenantId: 'tenant-1',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        tenantId: 'tenant-1',
        enabled: false,
        rewardType: 'fixed',
        fixedRewardCents: 0,
        percentRewardBps: null,
        settlementMode: 'credit_only',
        payoutThresholdCents: 0,
        fraudReviewEnabled: false,
        currencyCode: 'EUR',
        qualifyingEventType: 'first_paid_membership',
      });
    }
  });

  it('upserts a configurable fixed reward settings row', async () => {
    (db.insert as any).mockReturnValue({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              tenantId: 'tenant-1',
              enabled: true,
              rewardType: 'fixed',
              fixedRewardCents: 750,
              percentRewardBps: null,
              settlementMode: 'credit_or_payout',
              payoutThresholdCents: 10000,
              fraudReviewEnabled: true,
              currencyCode: 'EUR',
              qualifyingEventType: 'first_paid_membership',
            },
          ]),
        })),
      })),
    });

    const result = await upsertMemberReferralProgramSettingsCore({
      tenantId: 'tenant-1',
      settings: {
        enabled: true,
        rewardType: 'fixed',
        fixedRewardCents: 750,
        settlementMode: 'credit_or_payout',
        payoutThresholdCents: 10000,
        fraudReviewEnabled: true,
        currencyCode: 'EUR',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        tenantId: 'tenant-1',
        enabled: true,
        rewardType: 'fixed',
        fixedRewardCents: 750,
        settlementMode: 'credit_or_payout',
        payoutThresholdCents: 10000,
        fraudReviewEnabled: true,
        currencyCode: 'EUR',
      });
    }
    expect(db.insert).toHaveBeenCalled();
  });

  it('upserts configurable percent reward settings', async () => {
    (db.query.memberReferralSettings.findFirst as any).mockResolvedValue(null);
    (db.insert as any).mockReturnValue({
      values: insertValues.mockImplementation(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              tenantId: 'tenant-1',
              enabled: true,
              rewardType: 'percent',
              fixedRewardCents: null,
              percentRewardBps: 500,
              settlementMode: 'credit_only',
              payoutThresholdCents: 0,
              fraudReviewEnabled: false,
              currencyCode: 'EUR',
              qualifyingEventType: 'first_paid_membership',
            },
          ]),
        })),
      })),
    });

    const result = await upsertMemberReferralProgramSettingsCore({
      tenantId: 'tenant-1',
      settings: {
        enabled: true,
        rewardType: 'percent',
        percentRewardBps: 500,
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        tenantId: 'tenant-1',
        enabled: true,
        rewardType: 'percent',
        fixedRewardCents: null,
        percentRewardBps: 500,
      });
    }
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardType: 'percent',
        fixedRewardCents: null,
        percentRewardBps: 500,
      })
    );
  });
});
