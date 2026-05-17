import type { AgentCrmLeadDetailRepository } from '@interdomestik/domain-crm/lead-details';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { db } from '@interdomestik/database/db';
import { crmDeals, crmLeads } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export type AgentCrmLeadDetailLeadRow = typeof crmLeads.$inferSelect;
export type AgentCrmLeadDetailDealRow = Omit<typeof crmDeals.$inferSelect, 'leadId'> & {
  leadId: string;
};

function requireBranchScope(actor: CrmActorContext): string {
  const branchId = actor.scope.branchId;
  if (!branchId) {
    throw new Error('CRM lead detail read requires actor branch scope');
  }
  return branchId;
}

export const crmLeadDetailRepository: AgentCrmLeadDetailRepository<
  AgentCrmLeadDetailLeadRow,
  AgentCrmLeadDetailDealRow
> = {
  async findAgentLead(params) {
    const branchId = requireBranchScope(params.actor);

    const lead = await db.query.crmLeads.findFirst({
      where: and(
        eq(crmLeads.id, params.leadId),
        eq(crmLeads.tenantId, params.actor.tenantId),
        eq(crmLeads.agentId, params.actor.actorId),
        eq(crmLeads.branchId, branchId)
      ),
    });
    return lead ?? null;
  },

  async listAgentLeadDeals(params) {
    requireBranchScope(params.actor);

    const rows = await db
      .select()
      .from(crmDeals)
      .where(
        and(
          eq(crmDeals.leadId, params.lead.id),
          eq(crmDeals.tenantId, params.actor.tenantId),
          eq(crmDeals.agentId, params.actor.actorId)
        )
      );
    return rows as AgentCrmLeadDetailDealRow[];
  },
};
