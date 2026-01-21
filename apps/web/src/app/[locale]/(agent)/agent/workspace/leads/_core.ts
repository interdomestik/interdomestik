import { memberLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

export interface AgentLeadDTO {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  branch: {
    name: string;
  } | null;
  // Add other fields as needed based on feature page
  [key: string]: unknown;
}

export interface AgentWorkspaceLeadsResult {
  leads: AgentLeadDTO[];
}

/**
 * Pure helper for the leads where clause.
 */
export function buildAgentWorkspaceLeadsWhere(params: { tenantId: string }) {
  return eq(memberLeads.tenantId, params.tenantId);
}

/**
 * Pure core logic for the Agent Workspace Leads Page.
 * Fetches leads for the agent's tenant.
 */
export async function getAgentWorkspaceLeadsCore(params: {
  tenantId: string;
  db: any;
}): Promise<AgentWorkspaceLeadsResult> {
  const { tenantId, db } = params;

  const leadsData = await db.query.memberLeads.findMany({
    where: buildAgentWorkspaceLeadsWhere({ tenantId }),
    orderBy: (leads: any, { desc }: any) => [desc(leads.createdAt)],
    with: {
      branch: true,
    },
  });

  return {
    leads: leadsData.map((l: Record<string, unknown>) => ({
      ...l,
      createdAt: l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt as string),
      updatedAt: l.updatedAt instanceof Date ? l.updatedAt : new Date(l.updatedAt as string),
      branch: (l.branch as any) ? { name: (l.branch as any).name } : null,
    })) as AgentLeadDTO[],
  };
}
