import { withTenantContext } from '@interdomestik/database';
import { agentClients, claims } from '@interdomestik/database/schema';
import { and, count, eq, sql } from 'drizzle-orm';

export interface AgentCapacityResult {
  capacity: 'available' | 'near_limit' | 'overloaded';
  activeClients: number;
  recentClaimsVol: number;
}

export async function getAgentCapacitySignal(
  tenantId: string,
  agentId: string
): Promise<AgentCapacityResult> {
  // Signals: Total Active Clients + Claims touched in last 30d, both bound to the caller's tenant.

  const { clients, recentClaims } = await withTenantContext({ tenantId }, async tx => {
    const [clients] = await tx
      .select({ count: count() })
      .from(agentClients)
      .where(
        and(
          eq(agentClients.tenantId, tenantId),
          eq(agentClients.agentId, agentId),
          eq(agentClients.status, 'active')
        )
      );
    const [recentClaims] = await tx
      .select({ count: count() })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, tenantId),
          eq(claims.agentId, agentId),
          sql`${claims.createdAt} >= NOW() - INTERVAL '30 days'`
        )
      );
    return { clients, recentClaims };
  });

  const clientCount = Number(clients?.count ?? 0);
  const claimVol = Number(recentClaims?.count ?? 0);

  // Heuristic:
  // If clients > 200 OR recent claims > 50 => Overloaded
  // If clients > 100 OR recent claims > 20 => Near Limit

  let capacity: AgentCapacityResult['capacity'] = 'available';

  if (clientCount > 200 || claimVol > 50) {
    capacity = 'overloaded';
  } else if (clientCount > 100 || claimVol > 20) {
    capacity = 'near_limit';
  }

  return { capacity, activeClients: clientCount, recentClaimsVol: claimVol };
}
