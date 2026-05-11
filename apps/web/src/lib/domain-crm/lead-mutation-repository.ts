import type {
  CreateCrmLeadData,
  CrmLeadMutationRepository,
  CrmLeadStage,
  RecordCrmLeadActivityInput,
} from '@interdomestik/domain-crm/leads/mutations';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmLead, CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';
import { and, eq } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import { crmActivities, crmLeads } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';

type CrmLeadRow = typeof crmLeads.$inferSelect;
type CrmActivityRow = typeof crmActivities.$inferSelect;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapLead(row: CrmLeadRow): CrmLead {
  return {
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    companyName: row.companyName,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    email: row.email,
    fullName: row.fullName,
    id: row.id,
    notes: row.notes,
    phone: row.phone,
    score: row.score,
    source: row.source,
    stage: row.stage,
    tenantId: row.tenantId,
    type: row.type,
    updatedAt: toIso(row.updatedAt),
  };
}

function mapActivity(row: CrmActivityRow): CrmLeadActivity {
  return {
    agentId: row.agentId,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    description: row.description,
    id: row.id,
    leadId: row.leadId,
    occurredAt: toIso(row.occurredAt) ?? toIso(row.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: toIso(row.scheduledAt),
    subject: row.summary,
    tenantId: row.tenantId,
    type: row.type,
  };
}

export const crmLeadMutationRepository: CrmLeadMutationRepository = {
  async createLead(params: { actor: CrmActorContext; lead: CreateCrmLeadData }) {
    const now = new Date();
    // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context
    const [created] = await db
      .insert(crmLeads)
      .values({
        agentId: params.actor.actorId,
        branchId: params.actor.scope.branchId ?? null,
        companyName: params.lead.companyName ?? undefined,
        createdAt: now,
        email: params.lead.email ?? undefined,
        fullName: params.lead.fullName ?? undefined,
        id: params.lead.leadId,
        notes: params.lead.notes ?? undefined,
        phone: params.lead.phone ?? undefined,
        source: params.lead.source ?? undefined,
        stage: params.lead.stage,
        tenantId: params.actor.tenantId,
        type: params.lead.type,
        updatedAt: now,
      })
      .returning();
    return mapLead(created);
  },

  async findById(params: { actor: CrmActorContext; leadId: string }) {
    // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context before domain authorization
    const lead = await db.query.crmLeads.findFirst({
      where: withTenant(params.actor.tenantId, crmLeads.tenantId, eq(crmLeads.id, params.leadId)),
    });
    return lead ? mapLead(lead) : null;
  },

  async recordActivity(params: { activity: RecordCrmLeadActivityInput; actor: CrmActorContext }) {
    // `crm_activities` is the write-side event source that CRM11 timeline reads project from.
    // Domain writes do not write timeline rows directly.
    // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context
    const [created] = await db
      .insert(crmActivities)
      .values({
        agentId: params.actor.actorId,
        createdAt: new Date(params.activity.occurredAt),
        id: params.activity.activityId,
        leadId: params.activity.leadId,
        occurredAt: new Date(params.activity.occurredAt),
        summary: params.activity.summary,
        tenantId: params.actor.tenantId,
        type: params.activity.type,
      })
      .returning();
    return mapActivity(created);
  },

  async updateStage(params: { actor: CrmActorContext; leadId: string; stage: CrmLeadStage }) {
    const branchId = params.actor.scope.branchId;
    if (!branchId) return null;

    // db-access-guard: tenant-scoped -- reason: tenantId, agentId, and durable branchId from authorized CRM actor constrain update
    const [updated] = await db
      .update(crmLeads)
      .set({ stage: params.stage, updatedAt: new Date() })
      .where(
        and(
          eq(crmLeads.id, params.leadId),
          eq(crmLeads.tenantId, params.actor.tenantId),
          eq(crmLeads.agentId, params.actor.actorId),
          eq(crmLeads.branchId, branchId)
        )
      )
      .returning();
    return updated ? mapLead(updated) : null;
  },
};
