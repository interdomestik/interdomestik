import type { CrmActorContext } from '../context';
import type { CrmOutboxPort } from '../outbox/repository';
import { createCrmOutboxEventData } from '../outbox/mutations';
import type { CrmLeadRoutedEvent } from '../outbox/types';
import { selectCrmLeadAssignee } from './mutations';
import type {
  CrmRoutingAssignmentAuditAppendResult,
  CrmRoutingCursorAdvanceResult,
} from './repository';
import type {
  CrmLeadRoutedEventData,
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
  CrmRoutingCursorMap,
  CrmRoutingLeadSnapshot,
  CrmRoutingManualOverride,
  CrmRoutingManualReviewReason,
  CrmRoutingRejectionReason,
  CrmRoutingRule,
  CrmRoutingStrategy,
  CrmRoutingWorkloadSnapshot,
} from './types';

const CRM_ROUTING_CURSOR_RETRY_LIMIT = 3;

export interface ApplyCrmLeadRoutingDecisionInput {
  actor: CrmActorContext;
  leadId: string;
  idempotencyKey: string;
  now: string;
  override?: CrmRoutingManualOverride;
}

export type ApplyCrmLeadRoutingDecisionResult =
  | {
      outcome: 'routed';
      agentId: string;
      ruleId: string;
      strategy: CrmRoutingStrategy;
      event: CrmLeadRoutedEventData;
      ownershipChanged: boolean;
    }
  | {
      outcome: 'idempotent_replay';
      agentId: string;
      ruleId: string;
      strategy: CrmRoutingStrategy;
    }
  | { outcome: 'manual_review'; reason: CrmRoutingManualReviewReason; ruleId?: string }
  | { outcome: 'no_rule' }
  | { outcome: 'rejected'; reason: CrmRoutingRejectionReason }
  | { outcome: 'cursor_conflict_exhausted' }
  | {
      outcome: 'stale_lead';
      reason: 'lifecycle_terminal' | 'dedupe_state' | 'concurrent_owner_change';
    }
  | { outcome: 'repository_failure' };

export class CrmRoutingApplicationRollback extends Error {
  constructor(readonly result: ApplyCrmLeadRoutingDecisionResult) {
    super(`CRM routing application rollback: ${result.outcome}`);
  }
}

export interface CrmLeadRoutingApplicationPorts {
  advanceRoutingCursor(params: {
    advancement: CrmRoutingCursorAdvancement;
    idempotencyKey: string;
  }): Promise<CrmRoutingCursorAdvanceResult>;
  appendRoutingAssignmentAudit(params: {
    auditRecord: CrmRoutingAssignmentAuditRecord;
    idempotencyKey: string;
  }): Promise<CrmRoutingAssignmentAuditAppendResult>;
  findRoutingAssignmentAuditByIdempotency(params: {
    idempotencyKey: string;
    tenantId: string;
  }): Promise<CrmRoutingAssignmentAuditRecord | null>;
  getLeadRoutingSnapshot(params: {
    actor: CrmActorContext;
    leadId: string;
  }): Promise<CrmRoutingLeadSnapshot | null>;
  getRoutingCursors(params: {
    actor: CrmActorContext;
    ruleIds: readonly string[];
  }): Promise<CrmRoutingCursorMap>;
  getRoutingWorkloadSnapshot(params: {
    actor: CrmActorContext;
    now: string;
    rules: readonly CrmRoutingRule[];
  }): Promise<CrmRoutingWorkloadSnapshot>;
  listRoutingRules(params: { actor: CrmActorContext }): Promise<readonly CrmRoutingRule[]>;
  outbox: Pick<CrmOutboxPort, 'appendEvent'>;
  services: {
    outboxEventId(): string;
  };
  transferLeadOwnership(params: {
    actor: CrmActorContext;
    currentAgentId: string;
    currentBranchId: string;
    leadId: string;
    reason: string;
    targetAgentId: string;
    targetBranchId: string;
  }): Promise<boolean>;
}

function normalizeIdempotencyKey(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isTerminalLead(lead: CrmRoutingLeadSnapshot): boolean {
  return (
    lead.lifecycleState === 'archived' ||
    lead.lifecycleState === 'closed' ||
    lead.lifecycleState === 'converted' ||
    lead.lifecycleState === 'lost' ||
    lead.lifecycleState === 'won'
  );
}

function hasBlockedDedupeState(lead: CrmRoutingLeadSnapshot): boolean {
  return lead.dedupeState === 'merge_pending' || lead.dedupeState === 'merged_loser';
}

function staleLeadResult(
  lead: CrmRoutingLeadSnapshot
): Extract<ApplyCrmLeadRoutingDecisionResult, { outcome: 'stale_lead' }> | null {
  if (isTerminalLead(lead)) return { outcome: 'stale_lead', reason: 'lifecycle_terminal' };
  if (hasBlockedDedupeState(lead)) return { outcome: 'stale_lead', reason: 'dedupe_state' };
  return null;
}

function replayResult(params: {
  audit: CrmRoutingAssignmentAuditRecord;
  input: ApplyCrmLeadRoutingDecisionInput;
}): ApplyCrmLeadRoutingDecisionResult {
  const { audit, input } = params;
  if (audit.leadId !== input.leadId || audit.actorId !== input.actor.actorId) {
    return { outcome: 'rejected', reason: 'invalid_override' };
  }
  return {
    agentId: audit.agentId,
    outcome: 'idempotent_replay',
    ruleId: audit.ruleId,
    strategy: audit.strategy,
  };
}

function auditMatches(params: {
  actual: CrmRoutingAssignmentAuditRecord;
  expected: CrmRoutingAssignmentAuditRecord;
}): boolean {
  return (
    params.actual.actorId === params.expected.actorId &&
    params.actual.agentId === params.expected.agentId &&
    (params.actual.branchId ?? null) === (params.expected.branchId ?? null) &&
    (params.actual.idempotencyKey ?? null) === (params.expected.idempotencyKey ?? null) &&
    params.actual.leadId === params.expected.leadId &&
    params.actual.occurredAt === params.expected.occurredAt &&
    params.actual.reasonCode === params.expected.reasonCode &&
    params.actual.ruleId === params.expected.ruleId &&
    params.actual.strategy === params.expected.strategy &&
    params.actual.tenantId === params.expected.tenantId
  );
}

function authorizeApplicationActor(
  actor: CrmActorContext
): Extract<ApplyCrmLeadRoutingDecisionResult, { outcome: 'rejected' }> | null {
  if (!actor.tenantId.trim()) return { outcome: 'rejected', reason: 'tenant_scope' };
  if (actor.role === 'admin') return null;
  if (actor.role !== 'branch_manager') return { outcome: 'rejected', reason: 'role_scope' };
  if (!actor.scope.branchId?.trim()) return { outcome: 'rejected', reason: 'branch_scope' };
  return null;
}

function scopeRulesForActor(
  actor: CrmActorContext,
  rules: readonly CrmRoutingRule[]
): readonly CrmRoutingRule[] {
  if (actor.role !== 'branch_manager') return rules;
  return rules.filter(rule => rule.branchId === actor.scope.branchId);
}

function toRoutedEvent(params: {
  auditRecord: CrmRoutingAssignmentAuditRecord;
  event: CrmLeadRoutedEventData;
  input: ApplyCrmLeadRoutingDecisionInput;
}): CrmLeadRoutedEvent {
  return {
    actor: {
      actorId: params.input.actor.actorId,
      branchId: params.input.actor.scope.branchId ?? null,
      role: params.input.actor.role,
      tenantId: params.input.actor.tenantId,
    },
    aggregateId: params.input.leadId,
    aggregateType: 'lead',
    idempotencyKey: params.input.idempotencyKey,
    occurredAt: params.auditRecord.occurredAt,
    payload: params.event,
    tenantId: params.auditRecord.tenantId,
    type: 'crm.lead.routed',
  };
}

async function appendRoutedEvent(params: {
  auditRecord: CrmRoutingAssignmentAuditRecord;
  event: CrmLeadRoutedEventData;
  input: ApplyCrmLeadRoutingDecisionInput;
  ports: CrmLeadRoutingApplicationPorts;
}): Promise<void> {
  const event = createCrmOutboxEventData(
    {
      event: toRoutedEvent(params),
      idempotencyKey: params.input.idempotencyKey,
    },
    {
      clock: { now: () => params.input.now },
      ids: { outboxEventId: params.ports.services.outboxEventId },
    }
  );
  if ('success' in event) {
    throw new Error(`Invalid CRM routed event: ${event.reason}`);
  }
  await params.ports.outbox.appendEvent({ event });
}

async function applyAssignedDecision(params: {
  decision: Extract<ReturnType<typeof selectCrmLeadAssignee>, { outcome: 'assigned' }>;
  input: ApplyCrmLeadRoutingDecisionInput;
  ports: CrmLeadRoutingApplicationPorts;
  selectedFromLead: CrmRoutingLeadSnapshot;
}): Promise<ApplyCrmLeadRoutingDecisionResult | 'cursor_conflict'> {
  const { decision, input, ports, selectedFromLead } = params;
  const currentLead = await ports.getLeadRoutingSnapshot({
    actor: input.actor,
    leadId: input.leadId,
  });
  if (!currentLead) return { outcome: 'rejected', reason: 'tenant_scope' };

  const stale = staleLeadResult(currentLead);
  if (stale) return stale;

  if (
    currentLead.assignedAgentId !== selectedFromLead.assignedAgentId ||
    currentLead.branchId !== selectedFromLead.branchId
  ) {
    return { outcome: 'stale_lead', reason: 'concurrent_owner_change' };
  }

  const currentAgentId = currentLead.assignedAgentId;
  const currentBranchId = currentLead.branchId;
  if (!currentAgentId || !currentBranchId || !decision.event.branchId) {
    return { outcome: 'rejected', reason: 'branch_scope' };
  }

  if (decision.cursorAdvancement) {
    const cursorResult = await ports.advanceRoutingCursor({
      advancement: decision.cursorAdvancement,
      idempotencyKey: input.idempotencyKey,
    });
    if (!cursorResult.success) return 'cursor_conflict';
  }

  const ownershipChanged = currentAgentId !== decision.agentId;
  if (ownershipChanged) {
    const transferred = await ports.transferLeadOwnership({
      actor: input.actor,
      currentAgentId,
      currentBranchId,
      leadId: input.leadId,
      reason: 'routing_rule',
      targetAgentId: decision.agentId,
      targetBranchId: decision.event.branchId,
    });
    if (!transferred) {
      throw new CrmRoutingApplicationRollback({
        outcome: 'stale_lead',
        reason: 'concurrent_owner_change',
      });
    }
  }

  const auditAppend = await ports.appendRoutingAssignmentAudit({
    auditRecord: decision.auditRecord,
    idempotencyKey: input.idempotencyKey,
  });
  const audit = auditAppend.auditRecord;
  if (!auditMatches({ actual: audit, expected: decision.auditRecord })) {
    throw new CrmRoutingApplicationRollback({
      outcome: 'rejected',
      reason: 'invalid_override',
    });
  }
  if (auditAppend.status === 'existing') {
    throw new CrmRoutingApplicationRollback({
      agentId: audit.agentId,
      outcome: 'idempotent_replay',
      ruleId: audit.ruleId,
      strategy: audit.strategy,
    });
  }
  await appendRoutedEvent({
    auditRecord: decision.auditRecord,
    event: decision.event,
    input,
    ports,
  });

  return {
    agentId: decision.agentId,
    event: decision.event,
    outcome: 'routed',
    ownershipChanged,
    ruleId: decision.ruleId,
    strategy: decision.strategy,
  };
}

export async function applyCrmLeadRoutingDecision(
  input: ApplyCrmLeadRoutingDecisionInput,
  ports: CrmLeadRoutingApplicationPorts
): Promise<ApplyCrmLeadRoutingDecisionResult> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return { outcome: 'rejected', reason: 'invalid_override' };

  const normalizedInput = { ...input, idempotencyKey };
  const actorDenied = authorizeApplicationActor(normalizedInput.actor);
  if (actorDenied) return actorDenied;

  const replay = await ports.findRoutingAssignmentAuditByIdempotency({
    idempotencyKey,
    tenantId: input.actor.tenantId,
  });
  if (replay) return replayResult({ audit: replay, input: normalizedInput });

  for (let attempt = 0; attempt < CRM_ROUTING_CURSOR_RETRY_LIMIT; attempt += 1) {
    const lead = await ports.getLeadRoutingSnapshot({
      actor: normalizedInput.actor,
      leadId: normalizedInput.leadId,
    });
    if (!lead) return { outcome: 'rejected', reason: 'tenant_scope' };

    const stale = staleLeadResult(lead);
    if (stale) return stale;

    const rules = scopeRulesForActor(
      normalizedInput.actor,
      await ports.listRoutingRules({ actor: normalizedInput.actor })
    );
    const workloadSnapshot = await ports.getRoutingWorkloadSnapshot({
      actor: normalizedInput.actor,
      now: normalizedInput.now,
      rules,
    });
    const cursors = await ports.getRoutingCursors({
      actor: normalizedInput.actor,
      ruleIds: rules.map(rule => rule.id),
    });
    const decision = selectCrmLeadAssignee(
      { ...normalizedInput, lead },
      rules,
      workloadSnapshot,
      cursors
    );

    if (decision.outcome === 'assigned') {
      const result = await applyAssignedDecision({
        decision,
        input: normalizedInput,
        ports,
        selectedFromLead: lead,
      });
      if (result === 'cursor_conflict') continue;
      return result;
    }
    if (decision.outcome === 'manual_review') return decision;
    if (decision.outcome === 'no_rule') return decision;
    return decision;
  }

  return { outcome: 'cursor_conflict_exhausted' };
}
