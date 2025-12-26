import { describe, expect, it, vi } from 'vitest';

import { getMemberReferralLink, getMemberReferralStats } from './member-referrals';

vi.mock('./member-referrals/context', () => ({
  getActionContext: vi.fn(async () => ({
    session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
  })),
}));

vi.mock('./member-referrals/link', () => ({
  getMemberReferralLinkCore: vi.fn(async () => ({
    success: true,
    data: { code: 'JANE-ABC123', link: 'http://x?ref=JANE-ABC123', whatsappShareUrl: 'wa' },
  })),
}));

vi.mock('./member-referrals/stats', () => ({
  getMemberReferralStatsCore: vi.fn(async () => ({
    success: true,
    data: { totalReferred: 1, pendingRewards: 2, paidRewards: 3, rewardsCurrency: 'EUR' },
  })),
}));

describe('member-referrals action wrapper', () => {
  it('delegates getMemberReferralLink to core', async () => {
    const { getActionContext } = await import('./member-referrals/context');
    const { getMemberReferralLinkCore } = await import('./member-referrals/link');

    const result = await getMemberReferralLink();

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getMemberReferralLinkCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(result).toEqual({
      success: true,
      data: { code: 'JANE-ABC123', link: 'http://x?ref=JANE-ABC123', whatsappShareUrl: 'wa' },
    });
  });

  it('delegates getMemberReferralStats to core', async () => {
    const { getActionContext } = await import('./member-referrals/context');
    const { getMemberReferralStatsCore } = await import('./member-referrals/stats');

    const result = await getMemberReferralStats();

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getMemberReferralStatsCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(result).toEqual({
      success: true,
      data: { totalReferred: 1, pendingRewards: 2, paidRewards: 3, rewardsCurrency: 'EUR' },
    });
  });
});
