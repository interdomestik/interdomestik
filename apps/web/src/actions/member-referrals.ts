'use server';

import {
  getMemberReferralLink as getMemberReferralLinkCore,
  getMemberReferralProgramPreview as getMemberReferralProgramPreviewCore,
  getMemberReferralProgramSettings as getMemberReferralProgramSettingsCore,
  getMemberReferralStats as getMemberReferralStatsCore,
  listMemberReferralRewards as listMemberReferralRewardsCore,
  updateMemberReferralProgramSettings as updateMemberReferralProgramSettingsCore,
  updateMemberReferralRewardStatus as updateMemberReferralRewardStatusCore,
} from './member-referrals.core';

export type {
  ActionResult,
  MemberReferralAdminRewardRow,
  MemberReferralLink,
  MemberReferralProgramSettings,
  MemberReferralStats,
} from './member-referrals.core';

export const getMemberReferralProgramPreview = getMemberReferralProgramPreviewCore;
export const getMemberReferralLink = getMemberReferralLinkCore;
export const getMemberReferralProgramSettings = getMemberReferralProgramSettingsCore;
export const getMemberReferralStats = getMemberReferralStatsCore;
export const listMemberReferralRewards = listMemberReferralRewardsCore;
export const updateMemberReferralProgramSettings = updateMemberReferralProgramSettingsCore;
export const updateMemberReferralRewardStatus = updateMemberReferralRewardStatusCore;
