export type CommissionOwnershipOwnerType = 'agent' | 'company' | 'unresolved';

export interface CommissionOwnershipDriftDiagnostic {
  source: 'subscription.agentId' | 'user.agentId' | 'agent_clients';
  expectedAgentId: string | null;
  actualAgentId?: string | null;
  actualAgentIds?: string[];
}

export interface CommissionOwnershipResolution {
  ownerType: CommissionOwnershipOwnerType;
  agentId: string | null;
  diagnostics: CommissionOwnershipDriftDiagnostic[];
}

export interface ResolveCommissionOwnershipInput {
  subscriptionAgentId?: string | null;
  userAgentId?: string | null;
  agentClientAgentIds?: Array<string | null | undefined>;
}

function normalizeAgentIds(
  agentIds: Array<string | null | undefined> | undefined
): string[] | null {
  if (agentIds === undefined) {
    return null;
  }

  return [...new Set(agentIds.filter((agentId): agentId is string => Boolean(agentId)))];
}

export function resolveCommissionOwnership(
  input: ResolveCommissionOwnershipInput
): CommissionOwnershipResolution {
  if (input.subscriptionAgentId === undefined) {
    return {
      ownerType: 'unresolved',
      agentId: null,
      diagnostics: [
        {
          source: 'subscription.agentId',
          expectedAgentId: null,
          actualAgentId: null,
        },
      ],
    };
  }

  const resolvedAgentId = input.subscriptionAgentId;
  const diagnostics: CommissionOwnershipDriftDiagnostic[] = [];

  if (input.userAgentId !== undefined && input.userAgentId !== resolvedAgentId) {
    diagnostics.push({
      source: 'user.agentId',
      expectedAgentId: resolvedAgentId,
      actualAgentId: input.userAgentId,
    });
  }

  const agentClientAgentIds = normalizeAgentIds(input.agentClientAgentIds);
  if (
    agentClientAgentIds &&
    ((resolvedAgentId === null && agentClientAgentIds.length > 0) ||
      (resolvedAgentId !== null &&
        (agentClientAgentIds.length !== 1 || agentClientAgentIds[0] !== resolvedAgentId)))
  ) {
    diagnostics.push({
      source: 'agent_clients',
      expectedAgentId: resolvedAgentId,
      actualAgentIds: agentClientAgentIds,
    });
  }

  return {
    ownerType: resolvedAgentId === null ? 'company' : 'agent',
    agentId: resolvedAgentId,
    diagnostics,
  };
}
