import type { CrmActorContext } from '../context';
import { createCrmOutboxEventData } from '../outbox/mutations';
import type { CrmOutboxPort } from '../outbox/repository';
import {
  auditMatches,
  authorizeApplicationActor,
  normalizeIdempotencyKey,
  replayResult,
  scopeRulesForActor,
  staleLeadResult,
  toRoutedEvent,
} from './application-rules';
import type { CrmLeadRoutingApplicationPorts } from './application-service';
import { selectCrmLeadAssignee } from './mutations';
import type {
  CrmLeadRoutedEventData,
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingLeadSnapshot,
  CrmRoutingManualOverride,
  CrmRoutingManualReviewReason,
  CrmRoutingRejectionReason,
  CrmRoutingStrategy,
} from './types';

// The routing application as a plan: a generator that decides every step and yields each
// persistence operation as a request, without holding a database handle. A driver performs each
// request (on ports, or on one tenant transaction) and resumes the plan with its result. A
// `CrmRoutingApplicationRollback` thrown by the plan escapes the driver so the transaction rolls
// back.

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

/** The persistence operations a routing plan requests, keyed by name. */
export type CrmRoutingOperations = Omit<CrmLeadRoutingApplicationPorts, 'outbox' | 'services'> & {
  appendOutboxEvent: CrmOutboxPort['appendEvent'];
};
export type CrmRoutingOperationName = keyof CrmRoutingOperations;
type OperationParams<K extends CrmRoutingOperationName> = Parameters<CrmRoutingOperations[K]>[0];
type OperationResult<K extends CrmRoutingOperationName> = Awaited<
  ReturnType<CrmRoutingOperations[K]>
>;

/** One persistence request; the driver answers it with that operation's result. */
export type CrmRoutingRequest = {
  [K in CrmRoutingOperationName]: { operation: K; params: OperationParams<K> };
}[CrmRoutingOperationName];

type Step<T> = Generator<CrmRoutingRequest, T, unknown>;
export type CrmRoutingPlan = Step<ApplyCrmLeadRoutingDecisionResult>;
export type CrmRoutingPlanServices = { outboxEventId(): string };

function* request<K extends CrmRoutingOperationName>(
  operation: K,
  params: OperationParams<K>
): Step<OperationResult<K>> {
  return (yield { operation, params } as CrmRoutingRequest) as OperationResult<K>;
}

function* appendRoutedEvent(params: {
  auditRecord: CrmRoutingAssignmentAuditRecord;
  event: CrmLeadRoutedEventData;
  input: ApplyCrmLeadRoutingDecisionInput;
  services: CrmRoutingPlanServices;
}): Step<void> {
  const event = createCrmOutboxEventData(
    {
      event: toRoutedEvent(params),
      idempotencyKey: params.input.idempotencyKey,
    },
    {
      clock: { now: () => params.input.now },
      ids: { outboxEventId: params.services.outboxEventId },
    }
  );
  if ('success' in event) {
    throw new Error(`Invalid CRM routed event: ${event.reason}`);
  }
  yield* request('appendOutboxEvent', { event });
}

function* applyAssignedDecision(params: {
  decision: Extract<ReturnType<typeof selectCrmLeadAssignee>, { outcome: 'assigned' }>;
  input: ApplyCrmLeadRoutingDecisionInput;
  selectedFromLead: CrmRoutingLeadSnapshot;
  services: CrmRoutingPlanServices;
}): Step<ApplyCrmLeadRoutingDecisionResult | 'cursor_conflict'> {
  const { decision, input, selectedFromLead } = params;
  const currentLead = yield* request('getLeadRoutingSnapshot', {
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
    const cursorResult = yield* request('advanceRoutingCursor', {
      advancement: decision.cursorAdvancement,
      idempotencyKey: input.idempotencyKey,
    });
    if (!cursorResult.success) return 'cursor_conflict';
  }

  const ownershipChanged = currentAgentId !== decision.agentId;
  if (ownershipChanged) {
    const transferred = yield* request('transferLeadOwnership', {
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

  const auditAppend = yield* request('appendRoutingAssignmentAudit', {
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
  yield* appendRoutedEvent({
    auditRecord: decision.auditRecord,
    event: decision.event,
    input,
    services: params.services,
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

function* applyRoutingDecisionAttempt(
  input: ApplyCrmLeadRoutingDecisionInput,
  services: CrmRoutingPlanServices
): Step<ApplyCrmLeadRoutingDecisionResult | 'cursor_conflict'> {
  const lead = yield* request('getLeadRoutingSnapshot', {
    actor: input.actor,
    leadId: input.leadId,
  });
  if (!lead) return { outcome: 'rejected', reason: 'tenant_scope' };

  const stale = staleLeadResult(lead);
  if (stale) return stale;

  const rules = scopeRulesForActor(
    input.actor,
    yield* request('listRoutingRules', { actor: input.actor })
  );
  const workloadSnapshot = yield* request('getRoutingWorkloadSnapshot', {
    actor: input.actor,
    now: input.now,
    rules,
  });
  const cursors = yield* request('getRoutingCursors', {
    actor: input.actor,
    ruleIds: rules.map(rule => rule.id),
  });
  const decision = selectCrmLeadAssignee({ ...input, lead }, rules, workloadSnapshot, cursors);

  if (decision.outcome === 'assigned') {
    return yield* applyAssignedDecision({ decision, input, selectedFromLead: lead, services });
  }
  return decision;
}

/** Plans one routing application; drive it with every yielded request's result. */
export function* planCrmLeadRoutingDecision(
  input: ApplyCrmLeadRoutingDecisionInput,
  services: CrmRoutingPlanServices
): CrmRoutingPlan {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  if (!idempotencyKey) return { outcome: 'rejected', reason: 'invalid_override' };

  const normalizedInput = { ...input, idempotencyKey };
  const actorDenied = authorizeApplicationActor(normalizedInput.actor);
  if (actorDenied) return actorDenied;

  const replay = yield* request('findRoutingAssignmentAuditByIdempotency', {
    idempotencyKey,
    tenantId: input.actor.tenantId,
  });
  if (replay) return replayResult({ audit: replay, input: normalizedInput });

  for (let attempt = 0; attempt < CRM_ROUTING_CURSOR_RETRY_LIMIT; attempt += 1) {
    const result = yield* applyRoutingDecisionAttempt(normalizedInput, services);
    if (result === 'cursor_conflict') continue;
    return result;
  }

  return { outcome: 'cursor_conflict_exhausted' };
}
