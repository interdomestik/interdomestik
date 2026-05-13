import type {
  AgentCrmLeadActivity,
  AgentCrmLeadActivityRepository,
} from '@interdomestik/domain-crm/lead-activities';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { and, desc, eq } from 'drizzle-orm';

export type AgentCrmLeadActivityLeadRow = typeof crmLeads.$inferSelect;
export type AgentCrmLeadActivityRow = typeof crmActivities.$inferSelect & {
  agent?: { name: string | null } | null;
};

function requireBranchScope(actor: CrmActorContext): string {
  const branchId = actor.scope.branchId;
  if (!branchId) {
    throw new Error('CRM lead activity read requires actor branch scope');
  }
  return branchId;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapActivity(row: AgentCrmLeadActivityRow): AgentCrmLeadActivity {
  return {
    agent: row.agent ? { name: row.agent.name } : null,
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    description: null,
    id: row.id,
    leadId: row.leadId,
    occurredAt: toIso(row.occurredAt ?? row.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: toIso(row.scheduledAt),
    subject: row.summary,
    tenantId: row.tenantId,
    type: row.type,
  };
}

export const crmLeadActivityRepository: AgentCrmLeadActivityRepository<
  AgentCrmLeadActivityLeadRow,
  AgentCrmLeadActivity
> = {
  async findAgentLead(params) {
    const branchId = requireBranchScope(params.actor);

    // db-access-guard: tenant-predicate -- reason: domain CRM lead activity adapter constrains the parent lead by actor tenant, agent, and durable branch scope before activity reads
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

  async listAgentLeadActivities(params) {
    const branchId = requireBranchScope(params.actor);

    // db-access-guard: tenant-predicate -- reason: domain CRM lead activity adapter constrains activity feed reads by actor tenant, agent, lead, and activity branch snapshot
    const activities = await db.query.crmActivities.findMany({
      where: and(
        eq(crmActivities.leadId, params.lead.id),
        eq(crmActivities.tenantId, params.actor.tenantId),
        eq(crmActivities.agentId, params.actor.actorId),
        eq(crmActivities.branchId, branchId)
      ),
      columns: {
        agentId: true,
        branchId: true,
        completedAt: true,
        createdAt: true,
        id: true,
        leadId: true,
        occurredAt: true,
        scheduledAt: true,
        summary: true,
        tenantId: true,
        type: true,
      },
      limit: params.limit,
      orderBy: [desc(crmActivities.createdAt)],
      with: {
        agent: {
          columns: { name: true },
        },
      },
    });

    return activities.map(activity => mapActivity(activity as AgentCrmLeadActivityRow));
  },
};
