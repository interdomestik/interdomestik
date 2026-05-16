import {
  applyCrmLeadRoutingDecision,
  CrmRoutingApplicationRollback,
  type ApplyCrmLeadRoutingDecisionInput,
  type ApplyCrmLeadRoutingDecisionResult,
  type CrmLeadRoutingApplicationPorts,
  type CrmRoutingCursorMap,
  type CrmRoutingDedupeState,
  type CrmRoutingLeadLifecycleState,
  type CrmRoutingLeadSnapshot,
  type CrmRoutingRule,
  type CrmRoutingWorkloadSnapshot,
} from '@interdomestik/domain-crm/routing';
import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmOutboxPort } from '@interdomestik/domain-crm/outbox';
import { randomUUID } from 'node:crypto';
import { and, count, eq, gte, inArray, isNull } from 'drizzle-orm';

import { db } from '@interdomestik/database/db';
import {
  crmActivities,
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingCursors,
} from '@interdomestik/database/schema';

import { createCrmLeadMutationRepository } from './lead-mutation-repository';
import { createCrmRoutingRepository } from './routing-repository';

type CrmRoutingApplicationDb = typeof db;
type CrmLeadRow = typeof crmLeads.$inferSelect;
type AgentCountRow = { agentId: string; count: number };

export type ApplyCrmLeadRoutingDecisionCoordinatorOptions = {
  database?: CrmRoutingApplicationDb;
  createOutboxPort(database: CrmRoutingApplicationDb): Pick<CrmOutboxPort, 'appendEvent'>;
  services?: {
    outboxEventId(): string;
  };
};

function toRoutingLifecycle(stage: string): CrmRoutingLeadLifecycleState {
  if (
    stage === 'new' ||
    stage === 'contacted' ||
    stage === 'qualified' ||
    stage === 'proposal' ||
    stage === 'negotiation' ||
    stage === 'won' ||
    stage === 'lost'
  ) {
    return stage;
  }
  return 'closed';
}

function toRoutingLeadSnapshot(row: CrmLeadRow): CrmRoutingLeadSnapshot {
  return {
    assignedAgentId: row.agentId,
    branchId: row.branchId ?? null,
    dedupeState: 'clean' satisfies CrmRoutingDedupeState,
    id: row.id,
    lifecycleState: toRoutingLifecycle(row.stage),
    source: row.source ?? null,
    tenantId: row.tenantId,
    type: row.type,
    utmCampaign: row.utmCampaign ?? null,
    utmMedium: row.utmMedium ?? null,
    utmSource: row.utmSource ?? null,
  };
}

function startOfUtcDay(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(0);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function configuredAgentIds(rules: readonly CrmRoutingRule[]): string[] {
  return [
    ...new Set(
      rules.flatMap(rule =>
        [...rule.agentIds, rule.fallbackAgentId ?? ''].map(agentId => agentId.trim())
      )
    ),
  ].filter(Boolean);
}

function buildWorkloadSnapshot(params: {
  agentIds: readonly string[];
  newLeadsAssignedToday: readonly AgentCountRow[];
  openFollowUps: readonly AgentCountRow[];
  openLeads: readonly AgentCountRow[];
  now: string;
}): CrmRoutingWorkloadSnapshot {
  const openLeadCounts = new Map(params.openLeads.map(row => [row.agentId, row.count]));
  const followUpCounts = new Map(params.openFollowUps.map(row => [row.agentId, row.count]));
  const assignedTodayCounts = new Map(
    params.newLeadsAssignedToday.map(row => [row.agentId, row.count])
  );
  const agents: Record<string, CrmRoutingWorkloadSnapshot['agents'][string]> = {};
  for (const agentId of params.agentIds) {
    agents[agentId] = {
      capacityState: 'available',
      newLeadsAssignedToday: assignedTodayCounts.get(agentId) ?? 0,
      openFollowUps: followUpCounts.get(agentId) ?? 0,
      openLeads: openLeadCounts.get(agentId) ?? 0,
    };
  }
  return { agents, snapshotAt: params.now };
}

function createRoutingApplicationPorts(
  database: CrmRoutingApplicationDb,
  params: {
    outbox: Pick<CrmOutboxPort, 'appendEvent'>;
    services: { outboxEventId(): string };
  }
): CrmLeadRoutingApplicationPorts {
  const routing = createCrmRoutingRepository(database);
  const leads = createCrmLeadMutationRepository(database, { useTransaction: false });

  return {
    advanceRoutingCursor: routing.advanceRoutingCursor,
    appendRoutingAssignmentAudit: routing.appendRoutingAssignmentAudit,
    findRoutingAssignmentAuditByIdempotency: routing.findRoutingAssignmentAuditByIdempotency,
    async getLeadRoutingSnapshot(params: { actor: CrmActorContext; leadId: string }) {
      const predicates = [
        eq(crmLeads.tenantId, params.actor.tenantId),
        eq(crmLeads.id, params.leadId),
      ];
      if (params.actor.role === 'branch_manager') {
        const branchId = params.actor.scope.branchId;
        if (!branchId) return null;
        predicates.push(eq(crmLeads.branchId, branchId));
      }

      // db-access-guard: tenant-scoped -- reason: controlled CRM routing reads only the target lead by explicit actor tenant, lead id, and branch-manager branch scope when present
      const row = await database.query.crmLeads.findFirst({
        where: and(...predicates),
      });
      return row ? toRoutingLeadSnapshot(row) : null;
    },
    async getRoutingCursors(params: { actor: CrmActorContext; ruleIds: readonly string[] }) {
      if (params.ruleIds.length === 0) return {};

      // db-access-guard: tenant-scoped -- reason: controlled CRM routing cursor reads constrain by explicit actor tenant and selected rule ids
      const rows = await database.query.crmRoutingCursors.findMany({
        where: and(
          eq(crmRoutingCursors.tenantId, params.actor.tenantId),
          inArray(crmRoutingCursors.ruleId, [...params.ruleIds])
        ),
      });

      return Object.fromEntries(
        rows.map(row => [row.ruleId, row.cursorValue ?? null])
      ) as CrmRoutingCursorMap;
    },
    async getRoutingWorkloadSnapshot(params: {
      actor: CrmActorContext;
      now: string;
      rules: readonly CrmRoutingRule[];
    }) {
      const agentIds = configuredAgentIds(params.rules);
      if (agentIds.length === 0) {
        return { agents: {}, snapshotAt: params.now };
      }
      const openStages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
      const dayStart = startOfUtcDay(params.now);

      // db-access-guard: tenant-scoped -- reason: controlled CRM routing workload lead counts constrain by actor tenant and configured routing agent ids
      const openLeads = await database
        .select({ agentId: crmLeads.agentId, count: count() })
        .from(crmLeads)
        .where(
          and(
            eq(crmLeads.tenantId, params.actor.tenantId),
            inArray(crmLeads.agentId, agentIds),
            inArray(crmLeads.stage, openStages)
          )
        )
        .groupBy(crmLeads.agentId);

      // db-access-guard: tenant-scoped -- reason: controlled CRM routing workload follow-up counts constrain by actor tenant and configured routing agent ids
      const openFollowUps = await database
        .select({ agentId: crmActivities.agentId, count: count() })
        .from(crmActivities)
        .where(
          and(
            eq(crmActivities.tenantId, params.actor.tenantId),
            inArray(crmActivities.agentId, agentIds),
            eq(crmActivities.type, 'follow_up'),
            isNull(crmActivities.completedAt)
          )
        )
        .groupBy(crmActivities.agentId);

      // db-access-guard: tenant-scoped -- reason: controlled CRM routing same-day assignment counts constrain by actor tenant and configured routing agent ids
      const assignedToday = await database
        .select({ agentId: crmLeadOwnershipHistory.agentId, count: count() })
        .from(crmLeadOwnershipHistory)
        .where(
          and(
            eq(crmLeadOwnershipHistory.tenantId, params.actor.tenantId),
            inArray(crmLeadOwnershipHistory.agentId, agentIds),
            gte(crmLeadOwnershipHistory.effectiveFrom, dayStart)
          )
        )
        .groupBy(crmLeadOwnershipHistory.agentId);

      return buildWorkloadSnapshot({
        agentIds,
        newLeadsAssignedToday: assignedToday,
        now: params.now,
        openFollowUps,
        openLeads,
      });
    },
    listRoutingRules: routing.listRoutingRules,
    outbox: params.outbox,
    services: params.services,
    async transferLeadOwnership(params) {
      const updated = await leads.transferOwnership(params);
      return Boolean(updated);
    },
  };
}

export function createApplyCrmLeadRoutingDecisionCoordinator(
  options: ApplyCrmLeadRoutingDecisionCoordinatorOptions
) {
  const database = options.database ?? db;
  const services = options.services ?? { outboxEventId: randomUUID };

  return async function applyCrmLeadRoutingDecisionInTransaction(
    input: ApplyCrmLeadRoutingDecisionInput
  ): Promise<ApplyCrmLeadRoutingDecisionResult> {
    try {
      return await database.transaction(async tx => {
        const transaction = tx as never as CrmRoutingApplicationDb;
        return applyCrmLeadRoutingDecision(
          input,
          createRoutingApplicationPorts(transaction, {
            outbox: options.createOutboxPort(transaction),
            services,
          })
        );
      });
    } catch (error) {
      if (error instanceof CrmRoutingApplicationRollback) return error.result;
      return { outcome: 'repository_failure' };
    }
  };
}
