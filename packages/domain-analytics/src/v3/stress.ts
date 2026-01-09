import { db } from '@interdomestik/database';
import { claims, user } from '@interdomestik/database/schema';
import { and, count, eq, sql } from 'drizzle-orm';

export interface BranchStressResult {
  stressScore: number; // 0-100
  status: 'healthy' | 'warning' | 'overloaded';
  averageCaseLoad: number;
}

export async function getBranchStressIndex(
  tenantId: string,
  branchId: string
): Promise<BranchStressResult> {
  const [activeAgents] = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), eq(user.branchId, branchId), eq(user.role, 'agent')));

  // Count open claims (submitted, in_review) older than 7 days
  const [agingClaims] = await db
    .select({ count: count() })
    .from(claims)
    .where(
      and(
        eq(claims.tenantId, tenantId),
        eq(claims.branchId, branchId),
        sql`status IN ('submitted', 'in_review')`,
        sql`created_at < NOW() - INTERVAL '7 days'`
      )
    );

  const agentCount = activeAgents.count || 1; // avoid div/0
  const agingCount = agingClaims.count;

  // Simple Heuristic:
  // If aging claims per agent > 5 => Overloaded
  // If aging claims per agent > 2 => Warning

  const averageCaseLoad = agingCount / agentCount;

  let stressScore = Math.min((averageCaseLoad / 10) * 100, 100); // Normalize 10 cases/agent as 100% stress

  let status: BranchStressResult['status'] = 'healthy';
  if (averageCaseLoad > 5) status = 'overloaded';
  else if (averageCaseLoad > 2) status = 'warning';

  return { stressScore, status, averageCaseLoad };
}
