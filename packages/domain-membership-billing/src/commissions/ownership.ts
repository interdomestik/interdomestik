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

type NormalizedOwnershipSignals = {
  subscriptionAgentId: string | null | undefined;
  userAgentId: string | null | undefined;
  agentClientAgentIds: string[] | null;
};

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

function normalizeOwnershipSignals(
  input: ResolveCommissionOwnershipInput
): NormalizedOwnershipSignals {
  return {
    subscriptionAgentId: normalizeAgentId(input.subscriptionAgentId),
    userAgentId: normalizeAgentId(input.userAgentId),
    agentClientAgentIds: normalizeAgentIds(input.agentClientAgentIds),
  };
}

function buildMissingOwnershipResult(): CommissionOwnershipResolution {
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

function buildConflictingAssignmentsResult(
  agentClientAgentIds: string[]
): CommissionOwnershipResolution {
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

function resolveCanonicalSource(
  signals: NormalizedOwnershipSignals
): CommissionOwnershipSource | null {
  if (signals.agentClientAgentIds !== null) {
    return 'agent_clients';
  }

  if (signals.userAgentId !== undefined) {
    return 'user.agentId';
  }

  if (signals.subscriptionAgentId !== undefined) {
    return 'subscription.agentId';
  }

  return null;
}

function resolveCanonicalAgentId(
  resolvedFrom: CommissionOwnershipSource,
  signals: NormalizedOwnershipSignals
): string | null {
  if (resolvedFrom === 'agent_clients') {
    return signals.agentClientAgentIds?.[0] ?? null;
  }

  if (resolvedFrom === 'user.agentId') {
    return signals.userAgentId ?? null;
  }

  return signals.subscriptionAgentId ?? null;
}

function addScalarDiagnostic(
  diagnostics: CommissionOwnershipDriftDiagnostic[],
  source: Extract<CommissionOwnershipSource, 'subscription.agentId' | 'user.agentId'>,
  expectedAgentId: string | null,
  actualAgentId: string | null | undefined
) {
  if (actualAgentId === undefined || actualAgentId === expectedAgentId) {
    return;
  }

  diagnostics.push({
    source,
    expectedAgentId,
    actualAgentId,
  });
}

function agentClientsMatchCanonical(expectedAgentId: string | null, agentClientAgentIds: string[]) {
  if (expectedAgentId === null) {
    return agentClientAgentIds.length === 0;
  }

  return agentClientAgentIds.length === 1 && agentClientAgentIds[0] === expectedAgentId;
}

function addAgentClientDiagnostic(
  diagnostics: CommissionOwnershipDriftDiagnostic[],
  expectedAgentId: string | null,
  agentClientAgentIds: string[] | null
) {
  if (
    agentClientAgentIds === null ||
    agentClientsMatchCanonical(expectedAgentId, agentClientAgentIds)
  ) {
    return;
  }

  diagnostics.push({
    source: 'agent_clients',
    expectedAgentId,
    actualAgentIds: agentClientAgentIds,
  });
}

export function resolveCommissionOwnership(
  input: ResolveCommissionOwnershipInput
): CommissionOwnershipResolution {
  const signals = normalizeOwnershipSignals(input);

  if (signals.agentClientAgentIds && signals.agentClientAgentIds.length > 1) {
    return buildConflictingAssignmentsResult(signals.agentClientAgentIds);
  }

  const resolvedFrom = resolveCanonicalSource(signals);

  if (!resolvedFrom) {
    return buildMissingOwnershipResult();
  }

  const resolvedAgentId = resolveCanonicalAgentId(resolvedFrom, signals);
  const diagnostics: CommissionOwnershipDriftDiagnostic[] = [];

  if (resolvedFrom !== 'subscription.agentId') {
    addScalarDiagnostic(
      diagnostics,
      'subscription.agentId',
      resolvedAgentId,
      signals.subscriptionAgentId
    );
  }

  if (resolvedFrom !== 'user.agentId') {
    addScalarDiagnostic(diagnostics, 'user.agentId', resolvedAgentId, signals.userAgentId);
  }

  if (resolvedFrom !== 'agent_clients') {
    addAgentClientDiagnostic(diagnostics, resolvedAgentId, signals.agentClientAgentIds);
  }

  return {
    ownerType: resolvedAgentId === null ? 'company' : 'agent',
    agentId: resolvedAgentId,
    resolvedFrom,
    diagnostics,
  };
}
