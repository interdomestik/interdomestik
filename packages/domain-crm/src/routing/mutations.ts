import { isStaffLikeCrmActor } from '../context';
import type {
  CrmRoutingAgentWorkload,
  CrmRoutingAssignmentAuditReasonCode,
  CrmRoutingAssignmentDecision,
  CrmRoutingCursorAdvancement,
  CrmRoutingCursorMap,
  CrmRoutingLeadSnapshot,
  CrmRoutingRejectionReason,
  CrmRoutingRule,
  CrmRoutingWorkloadSnapshot,
  SelectCrmLeadAssigneeInput,
} from './types';
import { CRM_ROUTING_WORKLOAD_MAX_AGE_MINUTES } from './types';

function isNonEmptyString(value?: string | null): value is string {
  return Boolean(value?.trim());
}

function normalizeOptionalString(value?: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function optionalMatch(ruleValue: string | null | undefined, leadValue: string | null | undefined) {
  return !isNonEmptyString(ruleValue) || ruleValue.trim() === (leadValue?.trim() ?? '');
}

function parseTime(value: string): number | null {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isWithinEffectiveWindow(rule: CrmRoutingRule, now: string): boolean {
  const nowTime = parseTime(now);
  if (nowTime === null) return false;
  const effectiveFrom = rule.effectiveFrom ? parseTime(rule.effectiveFrom) : null;
  const effectiveTo = rule.effectiveTo ? parseTime(rule.effectiveTo) : null;

  if (rule.effectiveFrom && effectiveFrom === null) return false;
  if (rule.effectiveTo && effectiveTo === null) return false;
  if (effectiveFrom !== null && nowTime < effectiveFrom) return false;
  if (effectiveTo !== null && nowTime > effectiveTo) return false;
  return true;
}

function authorizeRouting(input: SelectCrmLeadAssigneeInput): CrmRoutingRejectionReason | null {
  const { actor, lead } = input;
  if (lead.tenantId !== actor.tenantId) return 'tenant_scope';
  if (!isStaffLikeCrmActor(actor)) return 'role_scope';
  if (actor.role === 'admin') return null;
  if (!actor.scope.branchId || !lead.branchId || actor.scope.branchId !== lead.branchId) {
    return 'branch_scope';
  }
  return null;
}

function leadStateRejection(lead: CrmRoutingLeadSnapshot): CrmRoutingRejectionReason | null {
  if (lead.dedupeState === 'merge_pending' || lead.dedupeState === 'merged_loser') {
    return 'dedupe_state';
  }
  if (
    lead.lifecycleState === 'archived' ||
    lead.lifecycleState === 'converted' ||
    lead.lifecycleState === 'closed' ||
    lead.lifecycleState === 'lost' ||
    lead.lifecycleState === 'won'
  ) {
    return 'lead_state';
  }
  return null;
}

function isFreshSnapshot(snapshot: CrmRoutingWorkloadSnapshot, now: string): boolean {
  const snapshotAt = parseTime(snapshot.snapshotAt);
  const nowTime = parseTime(now);
  if (snapshotAt === null || nowTime === null) return false;
  const maxAgeMs = CRM_ROUTING_WORKLOAD_MAX_AGE_MINUTES * 60 * 1000;
  return snapshotAt <= nowTime && nowTime - snapshotAt <= maxAgeMs;
}

function ruleMatchesLead(rule: CrmRoutingRule, lead: CrmRoutingLeadSnapshot, now: string): boolean {
  if (!rule.enabled) return false;
  if (rule.tenantId !== lead.tenantId) return false;
  if (isNonEmptyString(rule.branchId) && rule.branchId !== lead.branchId) return false;
  if (!optionalMatch(rule.source, lead.source)) return false;
  if (!optionalMatch(rule.leadType, lead.type)) return false;
  if (!optionalMatch(rule.utmSource, lead.utmSource)) return false;
  if (!optionalMatch(rule.utmMedium, lead.utmMedium)) return false;
  if (!optionalMatch(rule.utmCampaign, lead.utmCampaign)) return false;
  return isWithinEffectiveWindow(rule, now);
}

function matchingRules(
  ruleset: readonly CrmRoutingRule[],
  lead: CrmRoutingLeadSnapshot,
  now: string
): CrmRoutingRule[] {
  return ruleset
    .filter(rule => ruleMatchesLead(rule, lead, now))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

function workloadFor(
  workloadSnapshot: CrmRoutingWorkloadSnapshot,
  agentId: string
): CrmRoutingAgentWorkload {
  return (
    workloadSnapshot.agents[agentId] ?? {
      newLeadsAssignedToday: 0,
      openFollowUps: 0,
      openLeads: 0,
    }
  );
}

function isAgentAvailable(workload: CrmRoutingAgentWorkload): boolean {
  return !workload.capacityState || workload.capacityState === 'available';
}

function eligibleAgentIds(
  rule: CrmRoutingRule,
  workloadSnapshot: CrmRoutingWorkloadSnapshot
): string[] {
  return configuredAgentIds(rule).filter(agentId => {
    const workload = workloadFor(workloadSnapshot, agentId);
    if (!isAgentAvailable(workload)) return false;
    if (
      typeof rule.maxOpenLeadsPerAgent === 'number' &&
      workload.openLeads >= rule.maxOpenLeadsPerAgent
    ) {
      return false;
    }
    if (
      typeof rule.maxNewLeadsPerAgentPerDay === 'number' &&
      workload.newLeadsAssignedToday >= rule.maxNewLeadsPerAgentPerDay
    ) {
      return false;
    }
    return true;
  });
}

function configuredAgentIds(rule: CrmRoutingRule): string[] {
  return [
    ...new Set(
      rule.agentIds
        .map(agentId => normalizeOptionalString(agentId))
        .filter((agentId): agentId is string => agentId !== null)
    ),
  ];
}

function hasConfiguredAgentPool(rule: CrmRoutingRule): boolean {
  return configuredAgentIds(rule).length > 0;
}

function createCursorAdvancement(
  rule: CrmRoutingRule,
  eligibleIds: readonly string[],
  cursors: CrmRoutingCursorMap
): CrmRoutingCursorAdvancement {
  const priorCursor = cursors[rule.id] ?? null;
  const priorIndex = priorCursor ? eligibleIds.indexOf(priorCursor) : -1;
  const nextIndex = (priorIndex + 1) % eligibleIds.length;
  const agentId = eligibleIds[nextIndex];

  return {
    agentId,
    nextCursor: agentId,
    priorCursor,
    ruleId: rule.id,
  };
}

function createLeastLoadedAssignment(
  rule: CrmRoutingRule,
  eligibleIds: readonly string[],
  workloadSnapshot: CrmRoutingWorkloadSnapshot
): string {
  return [...eligibleIds].sort((left, right) => {
    const leftWorkload = workloadFor(workloadSnapshot, left);
    const rightWorkload = workloadFor(workloadSnapshot, right);
    return (
      leftWorkload.openLeads - rightWorkload.openLeads ||
      leftWorkload.openFollowUps - rightWorkload.openFollowUps ||
      leftWorkload.newLeadsAssignedToday - rightWorkload.newLeadsAssignedToday ||
      left.localeCompare(right)
    );
  })[0];
}

function assignmentDecision(params: {
  agentId: string;
  cursorAdvancement?: CrmRoutingCursorAdvancement;
  input: SelectCrmLeadAssigneeInput;
  reasonCode: CrmRoutingAssignmentAuditReasonCode;
  rule: CrmRoutingRule;
}): CrmRoutingAssignmentDecision {
  const { agentId, cursorAdvancement, input, reasonCode, rule } = params;
  const idempotencyKey = normalizeOptionalString(input.idempotencyKey);
  const auditRecord = {
    actorId: input.actor.actorId,
    agentId,
    branchId: input.lead.branchId,
    idempotencyKey,
    leadId: input.lead.id,
    occurredAt: input.now,
    reasonCode,
    ruleId: rule.id,
    strategy: rule.strategy,
    tenantId: input.lead.tenantId,
  };
  return {
    agentId,
    auditRecord,
    cursorAdvancement,
    event: {
      agentId,
      branchId: input.lead.branchId,
      fromAgentId: input.lead.assignedAgentId ?? null,
      leadId: input.lead.id,
      reasonCode,
      ruleId: rule.id,
      strategy: rule.strategy,
    },
    outcome: 'assigned',
    ruleId: rule.id,
    strategy: rule.strategy,
  };
}

function assignFromRule(params: {
  cursors: CrmRoutingCursorMap;
  input: SelectCrmLeadAssigneeInput;
  reasonCode: CrmRoutingAssignmentAuditReasonCode;
  rule: CrmRoutingRule;
  workloadSnapshot: CrmRoutingWorkloadSnapshot;
}): CrmRoutingAssignmentDecision | null {
  const { cursors, input, reasonCode, rule, workloadSnapshot } = params;
  if (rule.strategy === 'manual_only') {
    return { outcome: 'manual_review', reason: 'manual_only', ruleId: rule.id };
  }

  const eligibleIds = eligibleAgentIds(rule, workloadSnapshot);
  if (eligibleIds.length === 0) {
    if (isNonEmptyString(rule.fallbackAgentId)) {
      return assignmentDecision({
        agentId: rule.fallbackAgentId,
        input,
        reasonCode: 'fallback_agent',
        rule,
      });
    }
    return null;
  }

  if (rule.strategy === 'round_robin') {
    const cursorAdvancement = createCursorAdvancement(rule, eligibleIds, cursors);
    return assignmentDecision({
      agentId: cursorAdvancement.agentId,
      cursorAdvancement,
      input,
      reasonCode,
      rule,
    });
  }

  return assignmentDecision({
    agentId: createLeastLoadedAssignment(rule, eligibleIds, workloadSnapshot),
    input,
    reasonCode,
    rule,
  });
}

export function selectCrmLeadAssignee(
  input: SelectCrmLeadAssigneeInput,
  ruleset: readonly CrmRoutingRule[],
  workloadSnapshot: CrmRoutingWorkloadSnapshot,
  cursors: CrmRoutingCursorMap
): CrmRoutingAssignmentDecision {
  if (input.override) {
    if (!isNonEmptyString(input.override.agentId) || !isNonEmptyString(input.override.reason)) {
      return { outcome: 'rejected', reason: 'invalid_override' };
    }
  }

  const denied = authorizeRouting(input);
  if (denied) return { outcome: 'rejected', reason: denied };

  const leadStateDenied = leadStateRejection(input.lead);
  if (leadStateDenied) return { outcome: 'rejected', reason: leadStateDenied };

  if (input.override) {
    return { outcome: 'manual_review', reason: 'manual_override_direct_transfer' };
  }

  if (!isFreshSnapshot(workloadSnapshot, input.now)) {
    return { outcome: 'rejected', reason: 'stale_workload_snapshot' };
  }

  const rules = matchingRules(ruleset, input.lead, input.now);
  if (rules.length === 0) return { outcome: 'no_rule' };

  const rule = rules[0];
  const decision = assignFromRule({
    cursors,
    input,
    reasonCode: 'rule_match',
    rule,
    workloadSnapshot,
  });
  if (decision) return decision;

  if (isNonEmptyString(rule.fallbackRuleId)) {
    const fallbackRule = ruleset.find(
      candidate =>
        candidate.id === rule.fallbackRuleId &&
        candidate.id !== rule.id &&
        ruleMatchesLead(candidate, input.lead, input.now)
    );
    if (fallbackRule) {
      const fallbackDecision = assignFromRule({
        cursors,
        input,
        reasonCode: 'fallback_rule',
        rule: fallbackRule,
        workloadSnapshot,
      });
      if (fallbackDecision) return fallbackDecision;
    }
  }

  return {
    outcome: 'rejected',
    reason: hasConfiguredAgentPool(rule) ? 'capacity' : 'empty_agent_pool',
  };
}
