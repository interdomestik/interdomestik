import type * as DatabaseModule from '@interdomestik/database';
import { agentClients, user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

// Normal-tenant reads pass the tenant-bound transaction opened by getDocumentAccessCore.
type DatabaseClient = typeof DatabaseModule.db | DatabaseModule.TenantTransaction;

export type AgentScopedClaim = {
  agentId: string | null;
  branchId: string | null;
  ownerId: string | null;
};

/**
 * An agent reads a claim's documents only for a claim attributed to it whose owner is its active
 * client in this tenant, inside its branch (or on a claim without a branch), matching the agent
 * workspace claim scope. The agent row is read from the tenant, never trusted from the session.
 */
export async function hasAgentClaimDocumentScope(args: {
  agentId: string;
  claim: AgentScopedClaim;
  db: DatabaseClient;
  tenantId: string;
}): Promise<boolean> {
  const { agentId, claim, db, tenantId } = args;
  if (claim.agentId !== agentId || !claim.ownerId) return false;

  const [agent] = await db
    .select({ branchId: user.branchId })
    .from(user)
    .where(and(eq(user.id, agentId), eq(user.tenantId, tenantId)));
  if (!agent) return false;
  if (agent.branchId && claim.branchId && claim.branchId !== agent.branchId) return false;

  const [activeLink] = await db
    .select({ id: agentClients.id })
    .from(agentClients)
    .where(
      and(
        eq(agentClients.tenantId, tenantId),
        eq(agentClients.agentId, agentId),
        eq(agentClients.memberId, claim.ownerId),
        eq(agentClients.status, 'active')
      )
    );
  return Boolean(activeLink);
}
