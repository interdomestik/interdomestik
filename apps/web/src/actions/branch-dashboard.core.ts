'use server';

/**
 * Branch Dashboard Core Queries
 * V1: Read-only aggregate queries for branch overview
 *
 * All queries are tenant-scoped and use existing indexes.
 */

import type { BranchAgentRow, BranchMetadata, BranchStats } from '@/actions/branch-dashboard.types';
import { db } from '@interdomestik/database/db';
import { agentClients, claims, user } from '@interdomestik/database/schema';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';

/**
 * Fetch branch metadata by ID with tenant scoping
 */
export async function getBranchById(
  branchId: string,
  tenantId: string
): Promise<BranchMetadata | null> {
  const result = await db.query.branches.findFirst({
    where: (b, { and: andOp, eq: eqOp }) => andOp(eqOp(b.id, branchId), eqOp(b.tenantId, tenantId)),
  });

  if (!result) return null;

  return {
    id: result.id,
    name: result.name,
    code: result.code,
    isActive: result.isActive,
    tenantId: result.tenantId,
  };
}

/**
 * Aggregate stats for a branch
 * - Total agents
 * - Total members (assigned to agents in this branch)
 * - Total claims (all time)
 * - Claims created this month
 */
export async function getBranchStats(branchId: string, tenantId: string): Promise<BranchStats> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [agentCount, memberCount, claimsTotal, claimsMonth] = await Promise.all([
    // Count agents in branch
    db
      .select({ count: count() })
      .from(user)
      .where(and(eq(user.branchId, branchId), eq(user.tenantId, tenantId), eq(user.role, 'agent'))),

    // Count members assigned to agents in this branch
    db
      .select({ count: count() })
      .from(agentClients)
      .innerJoin(user, eq(agentClients.agentId, user.id))
      .where(and(eq(user.branchId, branchId), eq(user.tenantId, tenantId))),

    // Total claims for this branch (all time)
    db
      .select({ count: count() })
      .from(claims)
      .where(and(eq(claims.branchId, branchId), eq(claims.tenantId, tenantId))),

    // Claims created this month
    db
      .select({ count: count() })
      .from(claims)
      .where(
        and(
          eq(claims.branchId, branchId),
          eq(claims.tenantId, tenantId),
          gte(claims.createdAt, startOfMonth)
        )
      ),
  ]);

  return {
    totalAgents: agentCount[0]?.count ?? 0,
    totalMembers: memberCount[0]?.count ?? 0,
    totalClaimsAllTime: claimsTotal[0]?.count ?? 0,
    claimsThisMonth: claimsMonth[0]?.count ?? 0,
  };
}

/**
 * Fetch agents in a branch with their metrics
 * Uses subqueries to avoid N+1
 */
export async function getBranchAgents(
  branchId: string,
  tenantId: string
): Promise<BranchAgentRow[]> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const results = await db
    .select({
      agentId: user.id,
      agentName: user.name,
      memberCount: sql<number>`(
        SELECT COUNT(*) FROM agent_clients 
        WHERE agent_clients.agent_id = ${user.id}
      )`.as('member_count'),
      activeClaimCount: sql<number>`(
        SELECT COUNT(*) FROM claims 
        WHERE claims.agent_id = ${user.id} 
        AND claims.status NOT IN ('resolved', 'rejected', 'paid')
      )`.as('active_claim_count'),
      submittedClaimsLast30Days: sql<number>`(
        SELECT COUNT(*) FROM claims 
        WHERE claims.agent_id = ${user.id}
        AND claims.status = 'submitted'
        AND claims.created_at >= ${thirtyDaysAgo}
      )`.as('submitted_claims_last_30_days'),
    })
    .from(user)
    .where(and(eq(user.branchId, branchId), eq(user.tenantId, tenantId), eq(user.role, 'agent')))
    .orderBy(desc(sql`submitted_claims_last_30_days`));

  return results.map(r => ({
    agentId: r.agentId,
    agentName: r.agentName,
    memberCount: Number(r.memberCount) || 0,
    activeClaimCount: Number(r.activeClaimCount) || 0,
    submittedClaimsLast30Days: Number(r.submittedClaimsLast30Days) || 0,
  }));
}
