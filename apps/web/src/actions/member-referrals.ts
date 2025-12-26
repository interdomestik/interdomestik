'use server';

import type {
  ActionResult,
  MemberReferralLink,
  MemberReferralStats,
} from './member-referrals/types';

export type {
  ActionResult,
  MemberReferralLink,
  MemberReferralStats,
} from './member-referrals/types';

import { getActionContext } from './member-referrals/context';
import { getMemberReferralLinkCore } from './member-referrals/link';
import { getMemberReferralStatsCore } from './member-referrals/stats';

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
