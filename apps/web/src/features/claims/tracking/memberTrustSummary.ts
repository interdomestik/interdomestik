import type { ClaimStatus } from '@interdomestik/database/constants';
import type { ClaimSlaPhase } from '../policy';

export type ClaimMemberTrustState =
  | 'member_action_required'
  | 'active_handling'
  | 'completed'
  | 'outside_operational_sla';

export interface ClaimMemberTrustSummaryDto {
  state: ClaimMemberTrustState;
  titleKey: string;
  bodyKey: string;
  stateLabelKey: string;
  supportHref: string;
}

interface BuildMemberTrustSummaryInput {
  claimId?: string | null;
  status: ClaimStatus;
  slaPhase: ClaimSlaPhase;
}

function toMemberTrustState(args: BuildMemberTrustSummaryInput): ClaimMemberTrustState {
  if (args.status === 'resolved' || args.status === 'rejected') {
    return 'completed';
  }

  if (args.status === 'draft' || args.slaPhase === 'incomplete') {
    return 'member_action_required';
  }

  if (args.slaPhase === 'running') {
    return 'active_handling';
  }

  return 'outside_operational_sla';
}

export function buildMemberClaimTrustSummary(
  args: BuildMemberTrustSummaryInput
): ClaimMemberTrustSummaryDto {
  const state = toMemberTrustState(args);

  return {
    state,
    titleKey: 'claims-tracking.tracking.assurance.title',
    bodyKey: `claims-tracking.tracking.assurance.body.${state}`,
    stateLabelKey: `claims-tracking.tracking.assurance.state.${state}`,
    supportHref: args.claimId
      ? `/member/help?claimId=${encodeURIComponent(args.claimId)}`
      : '/member/help',
  };
}
