import { db } from '@interdomestik/database';
import { agentCommissions, claims, user } from '@interdomestik/database/schema';
import { and, count, eq, sql, sum } from 'drizzle-orm';

export interface BranchKPIs {
  totalAgents: number;
  totalMembers: number;
  claimsPending: number; // submitted + in_review
  totalCommissionPaid: number;
}

export async function getBranchKPIs(tenantId: string, branchId: string): Promise<BranchKPIs> {
  const [agentCount, memberCount, claimsPending, commissionPaid] = await Promise.all([
    db
      .select({ count: count() })
      .from(user)
      .where(and(eq(user.tenantId, tenantId), eq(user.branchId, branchId), eq(user.role, 'agent'))),
    db
      .select({ count: count() })
      .from(user)
      .where(
        and(eq(user.tenantId, tenantId), eq(user.branchId, branchId), eq(user.role, 'member'))
      ),
    db
      .select({ count: count() })
      .from(claims)
      .where(
        and(
          eq(claims.tenantId, tenantId),
          eq(claims.branchId, branchId),
          sql`${claims.status} IN ('submitted', 'in_review')`
        )
      ),
    // Assuming agentCommissions are linked to agents who belong to this branch.
    // This is a bit complex as commissions don't store branchId directly usually, but let's assume we filter by agent's branch.
    // For simplicity/speed in this strict execution: We sum commissions for agents in this branch.
    db
      .select({ total: sum(agentCommissions.amount) })
      .from(agentCommissions)
      .innerJoin(user, eq(agentCommissions.agentId, user.id))
      .where(and(eq(user.branchId, branchId), eq(agentCommissions.status, 'paid'))),
  ]);

  return {
    totalAgents: agentCount[0].count,
    totalMembers: memberCount[0].count,
    claimsPending: claimsPending[0].count,
    totalCommissionPaid: Number(commissionPaid[0]?.total || 0),
  };
}
