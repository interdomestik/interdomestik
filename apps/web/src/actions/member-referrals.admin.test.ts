import { describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/domain-users/admin/access', () => ({
  requireTenantAdminSession: vi.fn(async () => {
    throw new Error('Unauthorized');
  }),
}));

import type { Session } from './member-referrals/context';
import {
  listMemberReferralRewardsAdminCore,
  updateMemberReferralRewardStatusAdminCore,
} from './member-referrals/admin.core';

describe('member-referrals admin core', () => {
  it('throws Unauthorized when non-admin lists referral rewards', async () => {
    await expect(
      listMemberReferralRewardsAdminCore({
        session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
      })
    ).rejects.toThrow('Unauthorized');
  });

  it('throws Unauthorized when non-admin updates referral reward status', async () => {
    await expect(
      updateMemberReferralRewardStatusAdminCore({
        session: { user: { id: 'u1', role: 'user' } } as unknown as NonNullable<Session>,
        requestHeaders: new Headers(),
        rewardId: 'reward-1',
        newStatus: 'approved',
      })
    ).rejects.toThrow('Unauthorized');
  });
});
