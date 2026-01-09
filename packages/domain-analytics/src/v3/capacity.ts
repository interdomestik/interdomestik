import { db } from '@interdomestik/database';
import { agentClients, claims } from '@interdomestik/database/schema';
import { and, count, eq, sql } from 'drizzle-orm';

export interface AgentCapacityResult {
  capacity: 'available' | 'near_limit' | 'overloaded';
  activeClients: number;
  recentClaimsVol: number;
}

export async function getAgentCapacitySignal(agentId: string): Promise<AgentCapacityResult> {
  // Signals: Total Active Clients + Claims touched in last 30d

  const [clients] = await db
    .select({ count: count() })
    .from(agentClients)
    .where(and(eq(agentClients.agentId, agentId), eq(agentClients.status, 'active')));

  const [recentClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(and(eq(claims.agentId, agentId), sql`created_at >= NOW() - INTERVAL '30 days'`));

  const clientCount = clients.count;
  const claimVol = recentClaims.count;

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
