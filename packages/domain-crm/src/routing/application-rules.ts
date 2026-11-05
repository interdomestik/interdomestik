import type { CrmActorContext } from '../context';
import type { CrmLeadRoutedEvent } from '../outbox/types';
import type {
  ApplyCrmLeadRoutingDecisionInput,
  ApplyCrmLeadRoutingDecisionResult,
} from './application-plan';
import type {
  CrmLeadRoutedEventData,
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingLeadSnapshot,
  CrmRoutingRule,
} from './types';

// The SQL-free decisions of the routing application plan.

export function normalizeIdempotencyKey(value: string): string | null {
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

export function staleLeadResult(
  lead: CrmRoutingLeadSnapshot
): Extract<ApplyCrmLeadRoutingDecisionResult, { outcome: 'stale_lead' }> | null {
  if (isTerminalLead(lead)) return { outcome: 'stale_lead', reason: 'lifecycle_terminal' };
  if (hasBlockedDedupeState(lead)) return { outcome: 'stale_lead', reason: 'dedupe_state' };
  return null;
}

export function replayResult(params: {
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

export function auditMatches(params: {
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

export function authorizeApplicationActor(
  actor: CrmActorContext
): Extract<ApplyCrmLeadRoutingDecisionResult, { outcome: 'rejected' }> | null {
  if (!actor.tenantId.trim()) return { outcome: 'rejected', reason: 'tenant_scope' };
  if (actor.role === 'admin') return null;
  if (actor.role !== 'branch_manager') return { outcome: 'rejected', reason: 'role_scope' };
  if (!actor.scope.branchId?.trim()) return { outcome: 'rejected', reason: 'branch_scope' };
  return null;
}

export function scopeRulesForActor(
  actor: CrmActorContext,
  rules: readonly CrmRoutingRule[]
): readonly CrmRoutingRule[] {
  if (actor.role !== 'branch_manager') return rules;
  return rules.filter(rule => rule.branchId === actor.scope.branchId);
}

export function toRoutedEvent(params: {
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
