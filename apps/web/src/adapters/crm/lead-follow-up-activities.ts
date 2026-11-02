import { CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE } from '@interdomestik/domain-crm/leads/follow-up';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';
import { and, eq } from 'drizzle-orm';
import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export async function listCrmLeadFollowUpActivitiesForLead(params: {
  actor: CrmActorContext;
  authority: TenantAuthority;
  leadId: string;
  limit?: number;
}): Promise<CrmLeadActivity[]> {
  const branchId = params.actor.scope.branchId;
  if (!branchId) return [];

  // db-access-guard: tenant-scoped -- reason: tenant, branch, assigned actor, and lead visibility constrain legacy follow-up reads
  const rows = await withTenantAuthority(
    params.authority,
    async tx =>
      await tx
        .select({
          agentId: crmActivities.agentId,
          branchId: crmActivities.branchId,
          completedAt: crmActivities.completedAt,
          createdAt: crmActivities.createdAt,
          id: crmActivities.id,
          leadId: crmActivities.leadId,
          scheduledAt: crmActivities.scheduledAt,
          subject: crmActivities.summary,
          tenantId: crmActivities.tenantId,
          type: crmActivities.type,
        })
        .from(crmActivities)
        .innerJoin(
          crmLeads,
          and(
            eq(crmLeads.id, crmActivities.leadId),
            eq(crmLeads.tenantId, params.actor.tenantId),
            eq(crmLeads.agentId, params.actor.actorId),
            eq(crmLeads.branchId, branchId)
          )
        )
        .where(
          and(
            eq(crmActivities.tenantId, params.actor.tenantId),
            eq(crmActivities.agentId, params.actor.actorId),
            eq(crmActivities.branchId, branchId),
            eq(crmActivities.leadId, params.leadId),
            eq(crmActivities.type, CRM_LEAD_FOLLOW_UP_ACTIVITY_TYPE)
          )
        )
        .limit(params.limit ?? 25)
  );

  return rows.map(row => ({
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    description: null,
    id: row.id,
    leadId: row.leadId,
    occurredAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: toIso(row.scheduledAt),
    subject: row.subject,
    tenantId: row.tenantId,
    type: row.type,
  }));
}
