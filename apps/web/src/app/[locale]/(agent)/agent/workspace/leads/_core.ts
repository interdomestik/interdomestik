import { memberLeads } from '@interdomestik/database/schema';
import type * as DatabaseModule from '@interdomestik/database';
import { eq } from 'drizzle-orm';

type DatabaseClient = typeof DatabaseModule.db;

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

function getBranchName(branch: unknown): string | null {
  if (!branch || typeof branch !== 'object' || !('name' in branch)) {
    return null;
  }

  return typeof branch.name === 'string' ? branch.name : null;
}

/**
 * Pure core logic for the Agent Workspace Leads Page.
 * Fetches leads for the agent's tenant.
 */
export async function getAgentWorkspaceLeadsCore(params: {
  tenantId: string;
  db: DatabaseClient;
}): Promise<AgentWorkspaceLeadsResult> {
  const { tenantId, db } = params;

  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const leadsData = await db.query.memberLeads.findMany({
    where: buildAgentWorkspaceLeadsWhere({ tenantId }),
    orderBy: (leads, { desc }) => [desc(leads.createdAt)],
    with: {
      branch: true,
    },
  });

  return {
    leads: leadsData.map((l: Record<string, unknown>) => {
      const branchName = getBranchName(l.branch);

      return {
        ...l,
        createdAt: l.createdAt instanceof Date ? l.createdAt : new Date(l.createdAt as string),
        updatedAt: l.updatedAt instanceof Date ? l.updatedAt : new Date(l.updatedAt as string),
        branch: branchName ? { name: branchName } : null,
      };
    }) as AgentLeadDTO[],
  };
}
