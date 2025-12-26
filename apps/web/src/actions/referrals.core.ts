'use server';

import { getActionContext } from './referrals/context';
import { getAgentReferralLinkCore } from './referrals/get-agent-link';
import type { ActionResult, ReferralLinkResult } from './referrals/types';
export type { ActionResult, ReferralLinkResult } from './referrals/types';

/**
 * Get or create a referral link for the current agent.
 * If the agent doesn't have a referral code, one is generated.
 */
export async function getAgentReferralLink(): Promise<ActionResult<ReferralLinkResult>> {
  const { session } = await getActionContext();
  return getAgentReferralLinkCore({ session });
}
