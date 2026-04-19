export type CommissionOwnershipOwnerType = 'agent' | 'company' | 'unresolved';
export type CommissionOwnershipSource = 'subscription.agentId' | 'user.agentId' | 'agent_clients';

export interface CommissionOwnershipDriftDiagnostic {
  source: CommissionOwnershipSource;
  expectedAgentId: string | null;
  actualAgentId?: string | null;
  actualAgentIds?: string[];
}

export interface CommissionOwnershipResolution {
  ownerType: CommissionOwnershipOwnerType;
  agentId: string | null;
  resolvedFrom: CommissionOwnershipSource | null;
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

function normalizeAgentId(agentId: string | null | undefined): string | null | undefined {
  if (agentId === undefined) {
    return undefined;
  }

  if (agentId === null) {
    return null;
  }

  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveCommissionOwnership(
  input: ResolveCommissionOwnershipInput
): CommissionOwnershipResolution {
  const subscriptionAgentId = normalizeAgentId(input.subscriptionAgentId);
  const userAgentId = normalizeAgentId(input.userAgentId);
  const agentClientAgentIds = normalizeAgentIds(input.agentClientAgentIds);

  if (agentClientAgentIds && agentClientAgentIds.length > 1) {
    return {
      ownerType: 'unresolved',
      agentId: null,
      resolvedFrom: 'agent_clients',
      diagnostics: [
        {
          source: 'agent_clients',
          expectedAgentId: null,
          actualAgentIds: agentClientAgentIds,
        },
      ],
    };
  }

  const resolvedFrom =
    agentClientAgentIds !== null
      ? 'agent_clients'
      : userAgentId !== undefined
        ? 'user.agentId'
        : subscriptionAgentId !== undefined
          ? 'subscription.agentId'
          : null;

  if (!resolvedFrom) {
    return {
      ownerType: 'unresolved',
      agentId: null,
      resolvedFrom: null,
      diagnostics: [
        {
          source: 'subscription.agentId',
          expectedAgentId: null,
          actualAgentId: null,
        },
      ],
    };
  }

  const resolvedAgentId =
    resolvedFrom === 'agent_clients'
      ? (agentClientAgentIds?.[0] ?? null)
      : resolvedFrom === 'user.agentId'
        ? (userAgentId ?? null)
        : (subscriptionAgentId ?? null);
  const diagnostics: CommissionOwnershipDriftDiagnostic[] = [];

  if (resolvedFrom !== 'subscription.agentId' && subscriptionAgentId !== undefined) {
    if (subscriptionAgentId !== resolvedAgentId) {
      diagnostics.push({
        source: 'subscription.agentId',
        expectedAgentId: resolvedAgentId,
        actualAgentId: subscriptionAgentId,
      });
    }
  }

  if (
    resolvedFrom !== 'user.agentId' &&
    userAgentId !== undefined &&
    userAgentId !== resolvedAgentId
  ) {
    diagnostics.push({
      source: 'user.agentId',
      expectedAgentId: resolvedAgentId,
      actualAgentId: userAgentId,
    });
  }

  if (resolvedFrom !== 'agent_clients' && agentClientAgentIds !== null) {
    const matchesCanonical =
      (resolvedAgentId === null && agentClientAgentIds.length === 0) ||
      (resolvedAgentId !== null &&
        agentClientAgentIds.length === 1 &&
        agentClientAgentIds[0] === resolvedAgentId);

    if (!matchesCanonical) {
      diagnostics.push({
        source: 'agent_clients',
        expectedAgentId: resolvedAgentId,
        actualAgentIds: agentClientAgentIds,
      });
    }
  }

  return {
    ownerType: resolvedAgentId === null ? 'company' : 'agent',
    agentId: resolvedAgentId,
    resolvedFrom,
    diagnostics,
  };
}
