import {
  resolveCommercialLaunchScope,
  type CommercialEscalationReason,
} from '@/lib/commercial-claim-categories';

type CommercialEscalationDecision = 'requested' | 'declined';

export type SubmitClaimCommercialFlow = {
  escalationRequest: {
    claimCategory: string;
    decision: CommercialEscalationDecision;
    decisionReason: CommercialEscalationReason;
  };
  freeStartCompletion: {
    claimCategory: string;
  };
};

export function resolveCommercialFlow(rawCategory: string): SubmitClaimCommercialFlow {
  const launchScope = resolveCommercialLaunchScope(rawCategory);
  const claimCategory = launchScope.claimCategory ?? rawCategory.trim().toLowerCase();

  return {
    escalationRequest: {
      claimCategory,
      decision: launchScope.escalationEligible ? 'requested' : 'declined',
      decisionReason: launchScope.decisionReason,
    },
    freeStartCompletion: {
      claimCategory,
    },
  };
}
