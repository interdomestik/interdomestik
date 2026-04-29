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
 * Fetches leads for a tenant with branch relations.
 */
export async function getAgentLeadsCore(
  params: {
    tenantId: string;
    agentId?: string; // Optional: can be used for further isolation if needed
  },
  services: AgentLeadsServices
): Promise<MemberLeadRow[]> {
  const { tenantId } = params;
  const { db } = services;

  // Use the query builder to keep the "with branch" logic clean as per original route
  // Note: Original route ONLY filtered by tenantId, not agentId.
  // We keep this behavior but allow agentId for future refinement.
  return db.query.memberLeads.findMany({
    where: (leads, { eq }) => eq(leads.tenantId, tenantId),
    orderBy: (leads, { desc }) => [desc(leads.createdAt)],
    with: {
      branch: true,
    },
  });
}
