import type { SponsorOutlook } from '@interdomestik/domain-membership-billing/sponsor-coverage';
import { SELF_SERVE_PLAN_IDS } from './types';
import type { PlanId, SelfServePlanId } from './types';

export function isSelfServePlanId(planId: PlanId): planId is SelfServePlanId {
  return SELF_SERVE_PLAN_IDS.includes(planId as SelfServePlanId);
}

export function shouldOpenSelfServePrecheckout(args: {
  userId?: string;
  planId: PlanId;
  sponsorOutlook?: SponsorOutlook | null;
}): boolean {
  return !getSponsorCheckoutNotice(args.sponsorOutlook) && isSelfServePlanId(args.planId);
}

export function shouldRenderBusinessMembershipLink(args: {
  planId: PlanId;
  isPilotMode: boolean;
  isSessionPending: boolean;
}): boolean {
  return args.planId === 'business' && !args.isPilotMode && !args.isSessionPending;
}

export type SponsorCheckoutNotice = { key: 'coveredUntil' | 'startsOn'; date: Date };

export function getSponsorCheckoutNotice(
  outlook?: SponsorOutlook | null
): SponsorCheckoutNotice | null {
  if (outlook?.covering) return { key: 'coveredUntil', date: outlook.covering.coverageEnd };
  if (outlook?.nextStart) return { key: 'startsOn', date: outlook.nextStart };
  return null;
}
