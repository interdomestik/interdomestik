'use server';

import { z } from 'zod';

import type {
  ActionResult,
  MemberReferralLink,
  MemberReferralProgramSettings,
  MemberReferralRewardStatus,
  MemberReferralStats,
} from './member-referrals/types';

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

/**
 * Get or create a referral link for the current member.
 */
export async function getMemberReferralLink(): Promise<ActionResult<MemberReferralLink>> {
  const { session } = await getActionContext();
  return getMemberReferralLinkCore({ session });
}

/**
 * Get referral statistics for the current member.
 */
export async function getMemberReferralStats(): Promise<ActionResult<MemberReferralStats>> {
  const { session } = await getActionContext();
  return getMemberReferralStatsCore({ session });
}

export async function getMemberReferralProgramSettings(): Promise<
  ActionResult<MemberReferralProgramSettings>
> {
  const { session } = await getActionContext();
  return getMemberReferralProgramSettingsCore({ session });
}

export async function getMemberReferralProgramPreview(): Promise<
  ActionResult<MemberReferralProgramSettings>
> {
  const { session } = await getActionContext();
  return getMemberReferralProgramPreviewCore({ session });
}

export async function updateMemberReferralProgramSettings(
  data: unknown
): Promise<ActionResult<MemberReferralProgramSettings>> {
  const { requestHeaders, session } = await getActionContext();
  return updateMemberReferralProgramSettingsCore({ session, requestHeaders, data });
}

export async function listMemberReferralRewards(filters?: { limit?: number; offset?: number }) {
  const { session } = await getActionContext();
  const parsed = listRewardsFiltersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { success: false as const, error: 'Validation failed' };
  }
  return listMemberReferralRewardsAdminCore({ session, filters: parsed.data });
}

export async function updateMemberReferralRewardStatus(
  rewardId: string,
  newStatus: MemberReferralRewardStatus
) {
  const { requestHeaders, session } = await getActionContext();
  return updateMemberReferralRewardStatusAdminCore({
    session,
    requestHeaders,
    rewardId,
    newStatus,
  });
}
