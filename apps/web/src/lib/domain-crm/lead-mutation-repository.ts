import type {
  CreateCrmLeadData,
  CrmLeadMutationRepository,
  CrmLeadStage,
  RecordCrmLeadActivityInput,
} from '@interdomestik/domain-crm/leads/mutations';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmLead, CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import {
  branches,
  crmActivities,
  crmLeadOwnershipHistory,
  crmLeads,
  crmLeadStageHistory,
  user,
} from '@interdomestik/database/schema';
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
    lostAt: toIso(row.lostAt),
    updatedAt: toIso(row.updatedAt),
    wonAt: toIso(row.wonAt),
  };
}

function mapActivity(row: CrmActivityRow): CrmLeadActivity {
  return {
    agentId: row.agentId,
    branchId: row.branchId ?? null,
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

class MissingOpenOwnershipHistoryError extends Error {}

async function hasValidTransferTarget(params: {
  targetAgentId: string;
  targetBranchId: string;
  tenantId: string;
}): Promise<boolean> {
  // db-access-guard: tenant-scoped -- reason: validates transfer target agent belongs to the authorized CRM actor tenant and target branch
  const targetAgent = await db.query.user.findFirst({
    columns: { id: true },
    where: and(
      eq(user.id, params.targetAgentId),
      eq(user.tenantId, params.tenantId),
      eq(user.role, 'agent'),
      eq(user.branchId, params.targetBranchId)
    ),
  });

  if (!targetAgent) return false;

  // db-access-guard: tenant-scoped -- reason: validates transfer target branch belongs to the authorized CRM actor tenant
  const targetBranch = await db.query.branches.findFirst({
    columns: { id: true },
    where: and(eq(branches.id, params.targetBranchId), eq(branches.tenantId, params.tenantId)),
  });

  return Boolean(targetBranch);
}

export const crmLeadMutationRepository: CrmLeadMutationRepository = {
  async createLead(params: { actor: CrmActorContext; lead: CreateCrmLeadData }) {
    const now = new Date();
    const branchId = params.actor.scope.branchId;
    if (!branchId) {
      throw new Error('CRM lead creation requires actor branch scope');
    }

    // db-access-guard: tenant-scoped -- reason: creates CRM lead and initial ownership history with explicit authorized CRM actor tenant
    return db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context
      const [created] = await tx
        .insert(crmLeads)
        .values({
          agentId: params.actor.actorId,
          branchId,
          companyName: params.lead.companyName ?? undefined,
          createdAt: now,
          email: params.lead.email ?? undefined,
          fullName: params.lead.fullName ?? undefined,
          id: params.lead.leadId,
          notes: params.lead.notes ?? undefined,
          phone: params.lead.phone ?? undefined,
          source: params.lead.source ?? undefined,
          stage: params.lead.stage,
          lostAt: params.lead.stage === 'lost' ? now : null,
          tenantId: params.actor.tenantId,
          type: params.lead.type,
          updatedAt: now,
          wonAt: params.lead.stage === 'won' ? now : null,
        })
        .returning();

      // db-access-guard: tenant-scoped -- reason: ownership history copies explicit tenantId from authorized CRM actor after lead creation
      await tx.insert(crmLeadOwnershipHistory).values({
        agentId: params.actor.actorId,
        branchId,
        changedById: params.actor.actorId,
        createdAt: now,
        effectiveFrom: now,
        id: randomUUID(),
        leadId: created.id,
        reason: 'created',
        tenantId: params.actor.tenantId,
      });

      return mapLead(created);
    });
  },

  async findById(params: { actor: CrmActorContext; leadId: string }) {
    // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context before domain authorization
    const lead = await db.query.crmLeads.findFirst({
      where: withTenant(params.actor.tenantId, crmLeads.tenantId, eq(crmLeads.id, params.leadId)),
    });
    return lead ? mapLead(lead) : null;
  },

  async recordActivity(params: { activity: RecordCrmLeadActivityInput; actor: CrmActorContext }) {
    const branchId = params.actor.scope.branchId;
    if (!branchId) {
      throw new Error('CRM activity creation requires actor branch scope');
    }

    // `crm_activities` is the write-side event source that CRM11 timeline reads project from.
    // Domain writes do not write timeline rows directly.
    // db-access-guard: tenant-scoped -- reason: tenantId comes from explicit authorized CRM actor context
    const [created] = await db
      .insert(crmActivities)
      .values({
        agentId: params.actor.actorId,
        branchId,
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

  async updateStage(params: {
    actor: CrmActorContext;
    fromStage: CrmLeadStage;
    leadId: string;
    stage: CrmLeadStage;
  }) {
    const branchId = params.actor.scope.branchId;
    if (!branchId) return null;

    const now = new Date();
    return db.transaction(async tx => {
      // db-access-guard: tenant-scoped -- reason: tenantId, agentId, durable branchId, and current stage from authorized CRM actor constrain update
      const [updated] = await tx
        .update(crmLeads)
        .set({
          lostAt: params.stage === 'lost' ? now : null,
          stage: params.stage,
          updatedAt: now,
          wonAt: params.stage === 'won' ? now : null,
        })
        .where(
          and(
            eq(crmLeads.id, params.leadId),
            eq(crmLeads.tenantId, params.actor.tenantId),
            eq(crmLeads.agentId, params.actor.actorId),
            eq(crmLeads.branchId, branchId),
            eq(crmLeads.stage, params.fromStage)
          )
        )
        .returning();

      if (!updated) return null;

      // db-access-guard: tenant-scoped -- reason: history row copies explicit tenantId from authorized CRM actor after scoped stage update
      await tx.insert(crmLeadStageHistory).values({
        changedById: params.actor.actorId,
        createdAt: now,
        fromStage: params.fromStage,
        id: randomUUID(),
        leadId: params.leadId,
        occurredAt: now,
        tenantId: params.actor.tenantId,
        toStage: params.stage,
      });

      return mapLead(updated);
    });
  },

  async transferOwnership(params: {
    actor: CrmActorContext;
    currentAgentId: string;
    currentBranchId: string;
    leadId: string;
    reason: string;
    targetAgentId: string;
    targetBranchId: string;
  }) {
    const now = new Date();
    const targetIsValid = await hasValidTransferTarget({
      targetAgentId: params.targetAgentId,
      targetBranchId: params.targetBranchId,
      tenantId: params.actor.tenantId,
    });
    if (!targetIsValid) return null;

    try {
      return await db.transaction(async tx => {
        // db-access-guard: tenant-scoped -- reason: tenantId and expected current lead ownership from authorized CRM actor constrain transfer update
        const [updated] = await tx
          .update(crmLeads)
          .set({
            agentId: params.targetAgentId,
            branchId: params.targetBranchId,
            updatedAt: now,
          })
          .where(
            and(
              eq(crmLeads.id, params.leadId),
              eq(crmLeads.tenantId, params.actor.tenantId),
              eq(crmLeads.agentId, params.currentAgentId),
              eq(crmLeads.branchId, params.currentBranchId)
            )
          )
          .returning();

        if (!updated) return null;

        // db-access-guard: tenant-scoped -- reason: closes the current open ownership row for the same tenant-scoped lead transfer
        const closedRows = await tx
          .update(crmLeadOwnershipHistory)
          .set({ effectiveTo: now })
          .where(
            and(
              eq(crmLeadOwnershipHistory.tenantId, params.actor.tenantId),
              eq(crmLeadOwnershipHistory.leadId, params.leadId),
              eq(crmLeadOwnershipHistory.agentId, params.currentAgentId),
              eq(crmLeadOwnershipHistory.branchId, params.currentBranchId),
              isNull(crmLeadOwnershipHistory.effectiveTo)
            )
          )
          .returning({ id: crmLeadOwnershipHistory.id });

        if (closedRows.length !== 1) {
          throw new MissingOpenOwnershipHistoryError('missing open CRM lead ownership history row');
        }

        // db-access-guard: tenant-scoped -- reason: opens the new ownership row for the same tenant-scoped lead transfer
        await tx.insert(crmLeadOwnershipHistory).values({
          agentId: params.targetAgentId,
          branchId: params.targetBranchId,
          changedById: params.actor.actorId,
          createdAt: now,
          effectiveFrom: now,
          id: randomUUID(),
          leadId: params.leadId,
          reason: params.reason,
          tenantId: params.actor.tenantId,
        });

        return mapLead(updated);
      });
    } catch (error) {
      if (error instanceof MissingOpenOwnershipHistoryError) return null;
      throw error;
    }
  },
};
