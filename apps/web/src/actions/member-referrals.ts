'use server';
import {
  getMemberReferralLink,
  getMemberReferralProgramSettings,
  getMemberReferralStats,
  listMemberReferralRewards,
  updateMemberReferralProgramSettings,
  updateMemberReferralRewardStatus,
} from './member-referrals.core';
export type {
  ActionResult,
  MemberReferralLink,
  MemberReferralProgramSettings,
  MemberReferralStats,
} from './member-referrals.core';
export {
  getMemberReferralLink,
  getMemberReferralProgramSettings,
  getMemberReferralStats,
  listMemberReferralRewards,
  updateMemberReferralProgramSettings,
  updateMemberReferralRewardStatus,
};
