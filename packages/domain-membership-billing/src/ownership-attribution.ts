import { agentClients, and, db, eq } from '@interdomestik/database';

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

export interface ReadOnlyOwnershipAttributionSync {
  agentId: string | null;
  memberId: string;
  readScopeGranted: false;
  tenantId: string;
}

type AgentClientReadScopeRevoker = Pick<typeof db, 'update'>;

export async function recordReadOnlyOwnershipAttribution(
  _tx: unknown,
  args: {
    tenantId: string;
    memberId: string;
    agentId?: string | null;
  }
): Promise<ReadOnlyOwnershipAttributionSync> {
  const normalizedAgentId = normalizeAgentId(args.agentId);

  return {
    agentId: normalizedAgentId,
    memberId: args.memberId,
    readScopeGranted: false,
    tenantId: args.tenantId,
  };
}

export async function revokeAgentClientReadScope(
  tx: AgentClientReadScopeRevoker,
  args: {
    tenantId: string;
    memberId: string;
  }
): Promise<{ memberId: string; readScopeGranted: false; tenantId: string }> {
  await tx
    .update(agentClients)
    .set({ status: 'inactive' })
    .where(and(eq(agentClients.tenantId, args.tenantId), eq(agentClients.memberId, args.memberId)));

  return {
    memberId: args.memberId,
    readScopeGranted: false,
    tenantId: args.tenantId,
  };
}
