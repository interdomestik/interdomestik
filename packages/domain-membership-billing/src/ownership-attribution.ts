import { agentClients, and, db, eq } from '@interdomestik/database';
import { nanoid } from 'nanoid';

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

type AgentClientBindingWriter = Pick<typeof db, 'update' | 'insert'>;

export async function syncActiveAgentClientBinding(
  tx: AgentClientBindingWriter,
  args: {
    tenantId: string;
    memberId: string;
    agentId?: string | null;
    now?: Date;
    idFactory?: () => string;
  }
) {
  const now = args.now ?? new Date();
  const normalizedAgentId = normalizeAgentId(args.agentId);

  await tx
    .update(agentClients)
    .set({ status: 'inactive' })
    .where(and(eq(agentClients.tenantId, args.tenantId), eq(agentClients.memberId, args.memberId)));

  if (!normalizedAgentId) {
    return;
  }

  await tx
    .insert(agentClients)
    .values({
      id: args.idFactory?.() ?? nanoid(),
      tenantId: args.tenantId,
      agentId: normalizedAgentId,
      memberId: args.memberId,
      status: 'active',
      joinedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [agentClients.tenantId, agentClients.agentId, agentClients.memberId],
      set: {
        status: 'active',
        joinedAt: now,
      },
    });
}
