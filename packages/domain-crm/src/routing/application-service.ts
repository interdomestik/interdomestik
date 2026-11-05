import type { CrmActorContext } from '../context';
import type { CrmOutboxPort } from '../outbox/repository';
import {
  planCrmLeadRoutingDecision,
  type ApplyCrmLeadRoutingDecisionInput,
  type ApplyCrmLeadRoutingDecisionResult,
  type CrmRoutingRequest,
} from './application-plan';
import type {
  CrmRoutingAssignmentAuditAppendResult,
  CrmRoutingCursorAdvanceResult,
} from './repository';
import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
  CrmRoutingCursorMap,
  CrmRoutingLeadSnapshot,
  CrmRoutingRule,
  CrmRoutingWorkloadSnapshot,
} from './types';

export {
  CrmRoutingApplicationRollback,
  planCrmLeadRoutingDecision,
  type ApplyCrmLeadRoutingDecisionInput,
  type ApplyCrmLeadRoutingDecisionResult,
  type CrmRoutingOperationName,
  type CrmRoutingOperations,
  type CrmRoutingPlan,
  type CrmRoutingPlanServices,
  type CrmRoutingRequest,
} from './application-plan';

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

/** Performs one plan request on the ports. */
function performOnPorts(
  ports: CrmLeadRoutingApplicationPorts,
  request: CrmRoutingRequest
): Promise<unknown> {
  switch (request.operation) {
    case 'advanceRoutingCursor':
      return ports.advanceRoutingCursor(request.params);
    case 'appendOutboxEvent':
      return ports.outbox.appendEvent(request.params);
    case 'appendRoutingAssignmentAudit':
      return ports.appendRoutingAssignmentAudit(request.params);
    case 'findRoutingAssignmentAuditByIdempotency':
      return ports.findRoutingAssignmentAuditByIdempotency(request.params);
    case 'getLeadRoutingSnapshot':
      return ports.getLeadRoutingSnapshot(request.params);
    case 'getRoutingCursors':
      return ports.getRoutingCursors(request.params);
    case 'getRoutingWorkloadSnapshot':
      return ports.getRoutingWorkloadSnapshot(request.params);
    case 'listRoutingRules':
      return ports.listRoutingRules(request.params);
    case 'transferLeadOwnership':
      return ports.transferLeadOwnership(request.params);
  }
}

/** Applies a routing decision by driving the routing plan on `ports`. */
export async function applyCrmLeadRoutingDecision(
  input: ApplyCrmLeadRoutingDecisionInput,
  ports: CrmLeadRoutingApplicationPorts
): Promise<ApplyCrmLeadRoutingDecisionResult> {
  const plan = planCrmLeadRoutingDecision(input, ports.services);
  return drivePlanOnPorts(ports, plan, plan.next());
}

type CrmRoutingPlan = ReturnType<typeof planCrmLeadRoutingDecision>;

/** Performs each plan request in order on `ports`, then resumes the plan with its response. */
async function drivePlanOnPorts(
  ports: CrmLeadRoutingApplicationPorts,
  plan: CrmRoutingPlan,
  step: ReturnType<CrmRoutingPlan['next']>
): Promise<ApplyCrmLeadRoutingDecisionResult> {
  if (step.done) return step.value;
  const response = await performOnPorts(ports, step.value);
  return drivePlanOnPorts(ports, plan, plan.next(response));
}
