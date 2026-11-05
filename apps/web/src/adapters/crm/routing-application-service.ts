import {
  CrmRoutingApplicationRollback,
  planCrmLeadRoutingDecision,
  type ApplyCrmLeadRoutingDecisionInput,
  type ApplyCrmLeadRoutingDecisionResult,
  type CrmRoutingCursorMap,
  type CrmRoutingPlanServices,
  type CrmRoutingRequest,
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

import {
  crmActivities,
  crmLeadOwnershipHistory,
  crmLeads,
  crmRoutingCursors,
} from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { transferLeadOwnershipInTransaction } from './lead-mutation-repository';
import {
  advanceRoutingCursorInDatabase,
  appendRoutingAuditInDatabase,
  findRoutingAuditByIdempotencyInDatabase,
  listRoutingRulesInDatabase,
} from './routing-operations';
import type { CrmTenantExecutor } from './tenant-runner';

type CrmRoutingApplicationDb = CrmTenantExecutor;
type CrmRoutingOutbox = Pick<CrmOutboxPort, 'appendEvent'>;
type CrmLeadRow = typeof crmLeads.$inferSelect;
type AgentCountRow = { agentId: string; count: number };

export type ApplyCrmLeadRoutingDecisionCoordinatorOptions = {
  authority: TenantAuthority;
  /** Enqueues the routed event; it is invoked inside the routing transaction, so a failure rolls
   * the whole application back. */
  outbox: CrmRoutingOutbox;
  services?: CrmRoutingPlanServices;
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

async function getLeadRoutingSnapshotInDatabase(
  database: CrmRoutingApplicationDb,
  params: { actor: CrmActorContext; leadId: string }
): Promise<CrmRoutingLeadSnapshot | null> {
  const predicates = [eq(crmLeads.tenantId, params.actor.tenantId), eq(crmLeads.id, params.leadId)];
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
}

async function getRoutingCursorsInDatabase(
  database: CrmRoutingApplicationDb,
  params: { actor: CrmActorContext; ruleIds: readonly string[] }
): Promise<CrmRoutingCursorMap> {
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
}

async function getRoutingWorkloadSnapshotInDatabase(
  database: CrmRoutingApplicationDb,
  params: { actor: CrmActorContext; now: string; rules: readonly CrmRoutingRule[] }
): Promise<CrmRoutingWorkloadSnapshot> {
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
}

/** Performs one routing plan request on the routing transaction. */
async function performRoutingRequest(
  database: CrmRoutingApplicationDb,
  outbox: CrmRoutingOutbox,
  request: CrmRoutingRequest
): Promise<unknown> {
  switch (request.operation) {
    case 'advanceRoutingCursor':
      return advanceRoutingCursorInDatabase(database, request.params);
    case 'appendOutboxEvent':
      return outbox.appendEvent(request.params);
    case 'appendRoutingAssignmentAudit':
      return appendRoutingAuditInDatabase(database, request.params);
    case 'findRoutingAssignmentAuditByIdempotency':
      return findRoutingAuditByIdempotencyInDatabase(database, request.params);
    case 'getLeadRoutingSnapshot':
      return getLeadRoutingSnapshotInDatabase(database, request.params);
    case 'getRoutingCursors':
      return getRoutingCursorsInDatabase(database, request.params);
    case 'getRoutingWorkloadSnapshot':
      return getRoutingWorkloadSnapshotInDatabase(database, request.params);
    case 'listRoutingRules':
      return listRoutingRulesInDatabase(database, request.params);
    case 'transferLeadOwnership':
      return transferLeadOwnershipInTransaction(database, request.params);
  }
}

/** Drives the routing plan to completion on one tenant transaction. A rollback the plan throws
 * escapes, so the transaction rolls back before the coordinator translates it. */
async function applyInTransaction(
  database: CrmRoutingApplicationDb,
  input: ApplyCrmLeadRoutingDecisionInput,
  outbox: CrmRoutingOutbox,
  services: CrmRoutingPlanServices
): Promise<ApplyCrmLeadRoutingDecisionResult> {
  const plan = planCrmLeadRoutingDecision(input, services);
  let step = plan.next();
  while (!step.done) step = plan.next(await performRoutingRequest(database, outbox, step.value));
  return step.value;
}

export function createApplyCrmLeadRoutingDecisionCoordinator(
  options: ApplyCrmLeadRoutingDecisionCoordinatorOptions
) {
  const { authority, outbox } = options;
  const services = options.services ?? { outboxEventId: randomUUID };

  return async function applyCrmLeadRoutingDecisionInTransaction(
    input: ApplyCrmLeadRoutingDecisionInput
  ): Promise<ApplyCrmLeadRoutingDecisionResult> {
    try {
      return await withTenantAuthority(authority, tx =>
        applyInTransaction(tx, input, outbox, services)
      );
    } catch (error) {
      if (error instanceof CrmRoutingApplicationRollback) return error.result;
      return { outcome: 'repository_failure' };
    }
  };
}
