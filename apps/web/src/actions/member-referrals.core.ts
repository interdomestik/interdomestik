'use server';

import { z } from 'zod';

import type {
  ActionResult,
  MemberReferralLink,
  MemberReferralProgramSettings,
  MemberReferralRewardStatus,
  MemberReferralStats,
} from './member-referrals/types';

export type MemberReferralCardData = {
  link: string;
  whatsappShareUrl: string;
  stats: MemberReferralStats;
  settings: MemberReferralProgramSettings;
};

export type {
  ActionResult,
  MemberReferralAdminRewardRow,
  MemberReferralProgramSettings,
  MemberReferralLink,
  MemberReferralStats,
} from './member-referrals/types';

import { getActionContext } from './member-referrals/context';
import {
  listMemberReferralRewardsAdminCore,
  updateMemberReferralRewardStatusAdminCore,
} from './member-referrals/admin.core';
import { getMemberReferralLinkCore } from './member-referrals/link';
import {
  getMemberReferralProgramPreviewCore,
  getMemberReferralProgramSettingsCore,
  updateMemberReferralProgramSettingsCore,
} from './member-referrals/settings.core';
import { getMemberReferralStatsCore } from './member-referrals/stats';

const listRewardsFiltersSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();

export async function getMemberReferralCardData(): Promise<ActionResult<MemberReferralCardData>> {
  const { session, authority } = await getActionContext();
  const [linkResult, statsResult, settingsResult] = await Promise.all([
    getMemberReferralLinkCore({ session, authority }),
    getMemberReferralStatsCore({ session, authority }),
    getMemberReferralProgramPreviewCore({ session, authority }),
  ]);

  if (!linkResult.success) {
    return linkResult;
  }

  if (!statsResult.success) {
    return statsResult;
  }

  if (!settingsResult.success) {
    return settingsResult;
  }

  return {
    success: true,
    data: {
      link: linkResult.data.link,
      whatsappShareUrl: linkResult.data.whatsappShareUrl,
      stats: statsResult.data,
      settings: settingsResult.data,
    },
  };
}

/**
 * Get or create a referral link for the current member.
 */
export async function getMemberReferralLink(): Promise<ActionResult<MemberReferralLink>> {
  const { session, authority } = await getActionContext();
  return getMemberReferralLinkCore({ session, authority });
}

/**
 * Get referral statistics for the current member.
 */
export async function getMemberReferralStats(): Promise<ActionResult<MemberReferralStats>> {
  const { session, authority } = await getActionContext();
  return getMemberReferralStatsCore({ session, authority });
}

export async function getMemberReferralProgramSettings(): Promise<
  ActionResult<MemberReferralProgramSettings>
> {
  const { session, authority } = await getActionContext();
  return getMemberReferralProgramSettingsCore({ session, authority });
}

export async function getMemberReferralProgramPreview(): Promise<
  ActionResult<MemberReferralProgramSettings>
> {
  const { session, authority } = await getActionContext();
  return getMemberReferralProgramPreviewCore({ session, authority });
}

export async function updateMemberReferralProgramSettings(
  data: unknown
): Promise<ActionResult<MemberReferralProgramSettings>> {
  const { requestHeaders, session, authority } = await getActionContext();
  return updateMemberReferralProgramSettingsCore({ session, authority, requestHeaders, data });
}

export async function listMemberReferralRewards(filters?: { limit?: number; offset?: number }) {
  const { session, authority } = await getActionContext();
  const parsed = listRewardsFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { success: false as const, error: 'Validation failed' };
  }
  return listMemberReferralRewardsAdminCore({ session, authority, filters: parsed.data });
}

export async function updateMemberReferralRewardStatus(
  rewardId: string,
  newStatus: MemberReferralRewardStatus
) {
  const { requestHeaders, session, authority } = await getActionContext();
  return updateMemberReferralRewardStatusAdminCore({
    session,
    authority,
    requestHeaders,
    rewardId,
    newStatus,
  });
}
