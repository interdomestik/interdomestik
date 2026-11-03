import { db, withTenantContext } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listMemberReferralRewardsCore, updateMemberReferralRewardStatusCore } from './admin';

vi.mock('@interdomestik/database', () => {
  const db = {
    query: {
      memberReferralRewards: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
  };
  return {
    db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(db)),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  memberReferralRewards: {
    tenantId: 'tenantId',
    id: 'id',
    status: 'status',
    approvedAt: 'approvedAt',
    creditedAt: 'creditedAt',
    paidAt: 'paidAt',
    voidedAt: 'voidedAt',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();

  return {
    ...actual,
    eq: vi.fn((left, right) => [left, right]),
    and: vi.fn((...args) => args),
  };
});

const authority = mintTestTenantAuthority('tenant-1');

describe('member referral admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists referral rewards for a tenant', async () => {
    (db.query.memberReferralRewards.findMany as any).mockResolvedValue([
      {
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
      },
    ]);

    const result = await listMemberReferralRewardsCore({
      authority,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('reward-1');
      expect(result.data[0].tenantId).toBe('tenant-1');
    }
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(db.query.memberReferralRewards.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [['tenantId', 'tenant-1']],
      })
    );
  });

  it('approves a pending reward for the same tenant', async () => {
    (db.query.memberReferralRewards.findFirst as any).mockResolvedValue({
      id: 'reward-1',
      tenantId: 'tenant-1',
      status: 'pending',
      approvedAt: null,
      creditedAt: null,
      paidAt: null,
      voidedAt: null,
    });
    (db.update as any).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'reward-1',
              tenantId: 'tenant-1',
              status: 'approved',
              approvedAt: new Date('2026-03-23T10:00:00Z'),
              creditedAt: null,
              paidAt: null,
              voidedAt: null,
            },
          ]),
        })),
      })),
    });

    const result = await updateMemberReferralRewardStatusCore({
      authority,
      rewardId: 'reward-1',
      newStatus: 'approved',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('approved');
      expect(result.data.approvedAt).toBeInstanceOf(Date);
    }
    expect(db.query.memberReferralRewards.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          ['tenantId', 'tenant-1'],
          ['id', 'reward-1'],
        ],
      })
    );
    expect(db.update).toHaveBeenCalled();
  });

  it('rejects invalid status transitions', async () => {
    (db.query.memberReferralRewards.findFirst as any).mockResolvedValue({
      id: 'reward-1',
      tenantId: 'tenant-1',
      status: 'paid',
    });

    const result = await updateMemberReferralRewardStatusCore({
      authority,
      rewardId: 'reward-1',
      newStatus: 'approved',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid transition');
    }
    expect(db.update).not.toHaveBeenCalled();
  });
});
