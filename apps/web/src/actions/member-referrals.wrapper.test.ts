import { describe, expect, it, vi } from 'vitest';

import {
  getMemberReferralCardData,
  getMemberReferralLink,
  getMemberReferralProgramPreview,
  getMemberReferralProgramSettings,
  getMemberReferralStats,
  listMemberReferralRewards,
  updateMemberReferralProgramSettings,
  updateMemberReferralRewardStatus,
} from './member-referrals';

vi.mock('./member-referrals/context', () => ({
  getActionContext: vi.fn(async () => ({
    requestHeaders: new Headers(),
    session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
  })),
}));

vi.mock('./member-referrals/link', () => ({
  getMemberReferralLinkCore: vi.fn(async () => ({
    success: true,
    data: { code: 'JANE-ABC123', link: 'https://x?ref=JANE-ABC123', whatsappShareUrl: 'wa' },
  })),
}));

vi.mock('./member-referrals/stats', () => ({
  getMemberReferralStatsCore: vi.fn(async () => ({
    success: true,
    data: {
      totalReferred: 1,
      pendingRewards: 2,
      creditedRewards: 0,
      payoutEligibleRewards: 0,
      paidRewards: 3,
      rewardsCurrency: 'EUR',
    },
  })),
}));

vi.mock('./member-referrals/settings.core', () => ({
  getMemberReferralProgramSettingsCore: vi.fn(async () => ({
    success: true,
    data: {
      tenantId: 'tenant_1',
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 500,
      percentRewardBps: null,
      settlementMode: 'credit_only',
      payoutThresholdCents: 10000,
      fraudReviewEnabled: false,
      currencyCode: 'EUR',
      qualifyingEventType: 'first_paid_membership',
    },
  })),
  getMemberReferralProgramPreviewCore: vi.fn(async () => ({
    success: true,
    data: {
      tenantId: 'tenant_1',
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 500,
      percentRewardBps: null,
      settlementMode: 'credit_only',
      payoutThresholdCents: 10000,
      fraudReviewEnabled: false,
      currencyCode: 'EUR',
      qualifyingEventType: 'first_paid_membership',
    },
  })),
  updateMemberReferralProgramSettingsCore: vi.fn(async () => ({
    success: true,
    data: {
      tenantId: 'tenant_1',
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 750,
      percentRewardBps: null,
      settlementMode: 'credit_only',
      payoutThresholdCents: 10000,
      fraudReviewEnabled: false,
      currencyCode: 'EUR',
      qualifyingEventType: 'first_paid_membership',
    },
  })),
}));

vi.mock('./member-referrals/admin.core', () => ({
  listMemberReferralRewardsAdminCore: vi.fn(async () => ({
    success: true,
    data: [{ id: 'reward-1', status: 'pending' }],
  })),
  updateMemberReferralRewardStatusAdminCore: vi.fn(async () => ({
    success: true,
    data: { id: 'reward-1', status: 'approved' },
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
      data: { code: 'JANE-ABC123', link: 'https://x?ref=JANE-ABC123', whatsappShareUrl: 'wa' },
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
      data: {
        totalReferred: 1,
        pendingRewards: 2,
        creditedRewards: 0,
        payoutEligibleRewards: 0,
        paidRewards: 3,
        rewardsCurrency: 'EUR',
      },
    });
  });

  it('collapses member referral card data into a single action context fetch', async () => {
    const { getActionContext } = await import('./member-referrals/context');
    const { getMemberReferralLinkCore } = await import('./member-referrals/link');
    const { getMemberReferralStatsCore } = await import('./member-referrals/stats');
    const { getMemberReferralProgramPreviewCore } =
      await import('./member-referrals/settings.core');

    const result = await getMemberReferralCardData();

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getMemberReferralLinkCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(getMemberReferralStatsCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(getMemberReferralProgramPreviewCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(result).toEqual({
      success: true,
      data: {
        link: 'https://x?ref=JANE-ABC123',
        whatsappShareUrl: 'wa',
        stats: {
          totalReferred: 1,
          pendingRewards: 2,
          creditedRewards: 0,
          payoutEligibleRewards: 0,
          paidRewards: 3,
          rewardsCurrency: 'EUR',
        },
        settings: {
          tenantId: 'tenant_1',
          enabled: true,
          rewardType: 'fixed',
          fixedRewardCents: 500,
          percentRewardBps: null,
          settlementMode: 'credit_only',
          payoutThresholdCents: 10000,
          fraudReviewEnabled: false,
          currencyCode: 'EUR',
          qualifyingEventType: 'first_paid_membership',
        },
      },
    });
  });

  it('delegates getMemberReferralProgramSettings to core', async () => {
    const { getActionContext } = await import('./member-referrals/context');
    const { getMemberReferralProgramSettingsCore } =
      await import('./member-referrals/settings.core');

    const result = await getMemberReferralProgramSettings();

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getMemberReferralProgramSettingsCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(result.success).toBe(true);
  });

  it('delegates getMemberReferralProgramPreview to core', async () => {
    const { getActionContext } = await import('./member-referrals/context');
    const { getMemberReferralProgramPreviewCore } =
      await import('./member-referrals/settings.core');

    const result = await getMemberReferralProgramPreview();

    expect(getActionContext).toHaveBeenCalledTimes(1);
    expect(getMemberReferralProgramPreviewCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
    });
    expect(result.success).toBe(true);
  });

  it('delegates updateMemberReferralProgramSettings to core', async () => {
    const { updateMemberReferralProgramSettingsCore } =
      await import('./member-referrals/settings.core');

    const result = await updateMemberReferralProgramSettings({
      enabled: true,
      rewardType: 'fixed',
      fixedRewardCents: 750,
    });

    expect(updateMemberReferralProgramSettingsCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
      requestHeaders: expect.any(Headers),
      data: {
        enabled: true,
        rewardType: 'fixed',
        fixedRewardCents: 750,
      },
    });
    expect(result.success).toBe(true);
  });

  it('delegates listMemberReferralRewards to admin core', async () => {
    const { listMemberReferralRewardsAdminCore } = await import('./member-referrals/admin.core');

    const result = await listMemberReferralRewards({ limit: 10, offset: 20 });

    expect(listMemberReferralRewardsAdminCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
      filters: { limit: 10, offset: 20 },
    });
    expect(result).toEqual({ success: true, data: [{ id: 'reward-1', status: 'pending' }] });
  });

  it('delegates updateMemberReferralRewardStatus to admin core', async () => {
    const { updateMemberReferralRewardStatusAdminCore } =
      await import('./member-referrals/admin.core');

    const result = await updateMemberReferralRewardStatus('reward-1', 'approved');

    expect(updateMemberReferralRewardStatusAdminCore).toHaveBeenCalledWith({
      session: { user: { id: 'user-1', role: 'user', name: 'Jane Doe' } },
      requestHeaders: expect.any(Headers),
      rewardId: 'reward-1',
      newStatus: 'approved',
    });
    expect(result).toEqual({ success: true, data: { id: 'reward-1', status: 'approved' } });
  });
});
