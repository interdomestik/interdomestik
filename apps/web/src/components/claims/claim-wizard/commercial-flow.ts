import { COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES } from '@/lib/commercial-claim-categories';

export type CommercialFlowPayload = {
  escalationRequest?: {
    claimCategory?: string;
    decision?: 'requested' | 'declined';
    decisionReason?: string;
  };
  freeStartCompletion?: {
    claimCategory?: string;
  };
};

export function getStringPayloadValue(
  payload: unknown,
  key: 'claimId' | 'claimNumber'
): string | null {
  if (!payload || typeof payload !== 'object' || !(key in payload)) {
    return null;
  }

  const value = (payload as Record<typeof key, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export function getEscalationDecision(
  commercialFlow: CommercialFlowPayload | null,
  normalizedCategory: string
): { decision: 'requested' | 'declined'; decisionReason: string } {
  if (commercialFlow?.escalationRequest?.decision === 'requested') {
    return {
      decision: 'requested',
      decisionReason: commercialFlow.escalationRequest.decisionReason ?? 'launch_scope_supported',
    };
  }

  if (commercialFlow?.escalationRequest?.decision === 'declined') {
    return {
      decision: 'declined',
      decisionReason: commercialFlow.escalationRequest.decisionReason ?? 'outside_launch_scope',
    };
  }

  if (COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORIES.has(normalizedCategory)) {
    return { decision: 'requested', decisionReason: 'launch_scope_supported' };
  }

  return { decision: 'declined', decisionReason: 'outside_launch_scope' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getOptionalEscalationDecision(value: unknown): 'requested' | 'declined' | undefined {
  return value === 'requested' || value === 'declined' ? value : undefined;
}

export function getCommercialFlowFromResult(payload: unknown): CommercialFlowPayload | null {
  if (!isRecord(payload) || !('commercialFlow' in payload)) {
    return null;
  }

  const commercialFlow = payload.commercialFlow;
  if (!isRecord(commercialFlow)) {
    return null;
  }

  const escalationRequest = isRecord(commercialFlow.escalationRequest)
    ? {
        claimCategory: getOptionalString(commercialFlow.escalationRequest.claimCategory),
        decision: getOptionalEscalationDecision(commercialFlow.escalationRequest.decision),
        decisionReason: getOptionalString(commercialFlow.escalationRequest.decisionReason),
      }
    : undefined;
  const freeStartCompletion = isRecord(commercialFlow.freeStartCompletion)
    ? {
        claimCategory: getOptionalString(commercialFlow.freeStartCompletion.claimCategory),
      }
    : undefined;

  if (!escalationRequest && !freeStartCompletion) {
    return null;
  }

  return {
    escalationRequest,
    freeStartCompletion,
  };
}
