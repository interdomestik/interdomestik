function normalizeAgentId(agentId: string | null | undefined): string | null {
  if (typeof agentId !== 'string') return null;
  const normalized = agentId.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createSelfServeOwnershipAttribution(agentId?: string | null) {
  const normalizedAgentId = normalizeAgentId(agentId);

  return {
    agentId: normalizedAgentId,
    createdBy: 'self' as const,
    assistedByAgentId: normalizedAgentId,
  };
}

export function createAgentAssistedOwnershipAttribution(agentId: string) {
  const normalizedAgentId = normalizeAgentId(agentId);
  if (!normalizedAgentId) {
    throw new Error('Agent-assisted ownership attribution requires an agentId');
  }

  return {
    agentId: normalizedAgentId,
    createdBy: 'agent' as const,
    assistedByAgentId: normalizedAgentId,
  };
}
