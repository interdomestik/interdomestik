import { SELF_SERVE_PLAN_IDS } from './types';
import type { PlanId, SelfServePlanId } from './types';

export function isSelfServePlanId(planId: PlanId): planId is SelfServePlanId {
  return SELF_SERVE_PLAN_IDS.includes(planId as SelfServePlanId);
}

export function shouldOpenSelfServePrecheckout(args: { userId?: string; planId: PlanId }): boolean {
  return !args.userId && isSelfServePlanId(args.planId);
}

export function shouldRenderBusinessMembershipLink(args: {
  planId: PlanId;
  isPilotMode: boolean;
  isSessionPending: boolean;
}): boolean {
  return args.planId === 'business' && !args.isPilotMode && !args.isSessionPending;
}
