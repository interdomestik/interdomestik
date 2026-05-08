import type * as DatabaseModule from '@interdomestik/database';

type DatabaseClient = typeof DatabaseModule.db;
type MemberLeadRow = Awaited<
  ReturnType<DatabaseClient['query']['memberLeads']['findMany']>
>[number];

export interface AgentLeadsServices {
  db: DatabaseClient;
}

/**
 * Pure core logic for the Agent Leads page.
 * Fetches leads for the signed-in agent within their tenant and branch.
 */
export async function getAgentLeadsCore(
  params: {
    tenantId: string;
    agentId: string;
    branchId: string;
  },
  services: AgentLeadsServices
): Promise<MemberLeadRow[]> {
  const { tenantId, agentId, branchId } = params;
  const { db } = services;

  return db.query.memberLeads.findMany({
    where: (leads, { and, eq }) =>
      and(eq(leads.tenantId, tenantId), eq(leads.agentId, agentId), eq(leads.branchId, branchId)),
    orderBy: (leads, { desc }) => [desc(leads.createdAt)],
    with: {
      branch: true,
    },
  });
}
