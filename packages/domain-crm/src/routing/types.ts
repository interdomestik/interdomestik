import type { CrmActorContext } from '../context';

export const CRM_ROUTING_WORKLOAD_MAX_AGE_MINUTES = 15;

export type CrmRoutingStrategy = 'round_robin' | 'least_loaded' | 'manual_only';

export type CrmRoutingDeferredStrategy =
  | 'sticky_account'
  | 'territory'
  | 'weighted_round_robin'
  | 'first_available';

export type CrmRoutingDedupeState = 'clean' | 'merge_pending' | 'merged_loser' | 'merged_winner';

export type CrmRoutingLeadLifecycleState =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'
  | 'archived'
  | 'converted'
  | 'closed';

export type CrmRoutingCapacityState = 'available' | 'at_capacity' | 'pto' | 'offline';

export type CrmRoutingRejectionReason =
  | 'tenant_scope'
  | 'branch_scope'
  | 'role_scope'
  | 'lead_state'
  | 'dedupe_state'
  | 'no_matching_rule'
  | 'empty_agent_pool'
  | 'capacity'
  | 'stale_workload_snapshot'
  | 'cursor_conflict'
  | 'invalid_override';

export type CrmRoutingManualReviewReason =
  | 'manual_only'
  | 'manual_override_direct_transfer'
  | 'fallback_required';

export type CrmRoutingRule = {
  agentIds: readonly string[];
  branchId?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  enabled: boolean;
  fallbackAgentId?: string | null;
  fallbackRuleId?: string | null;
  id: string;
  leadType?: string | null;
  maxNewLeadsPerAgentPerDay?: number | null;
  maxOpenLeadsPerAgent?: number | null;
  priority: number;
  source?: string | null;
  strategy: CrmRoutingStrategy;
  tenantId: string;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
};

export type CrmRoutingLeadSnapshot = {
  assignedAgentId?: string | null;
  branchId?: string | null;
  dedupeState: CrmRoutingDedupeState;
  id: string;
  lifecycleState: CrmRoutingLeadLifecycleState;
  source?: string | null;
  tenantId: string;
  type: string;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
};

export type CrmRoutingAgentWorkload = {
  capacityState?: CrmRoutingCapacityState | null;
  newLeadsAssignedToday: number;
  openFollowUps: number;
  openLeads: number;
};

export type CrmRoutingWorkloadSnapshot = {
  agents: Readonly<Record<string, CrmRoutingAgentWorkload>>;
  snapshotAt: string;
};

export type CrmRoutingCursorMap = Readonly<Record<string, string | null | undefined>>;

export type CrmRoutingCursorAdvancement = {
  agentId: string;
  nextCursor: string;
  priorCursor: string | null;
  ruleId: string;
  tenantId: string;
};

export type CrmRoutingManualOverride = {
  agentId: string;
  reason: string;
};

export type CrmRoutingAssignmentAuditReasonCode = 'rule_match' | 'fallback_agent' | 'fallback_rule';

export type CrmRoutingAssignmentAuditRecord = {
  actorId: string;
  agentId: string;
  branchId?: string | null;
  idempotencyKey?: string | null;
  leadId: string;
  occurredAt: string;
  reasonCode: CrmRoutingAssignmentAuditReasonCode;
  ruleId: string;
  strategy: CrmRoutingStrategy;
  tenantId: string;
};

export type CrmLeadRoutedEventData = {
  agentId: string;
  branchId?: string | null;
  fromAgentId?: string | null;
  leadId: string;
  reasonCode: CrmRoutingAssignmentAuditReasonCode;
  ruleId: string;
  strategy: CrmRoutingStrategy;
};

export type SelectCrmLeadAssigneeInput = {
  actor: CrmActorContext;
  idempotencyKey?: string | null;
  lead: CrmRoutingLeadSnapshot;
  now: string;
  override?: CrmRoutingManualOverride;
};

export type CrmRoutingAssignmentDecision =
  | {
      auditRecord: CrmRoutingAssignmentAuditRecord;
      cursorAdvancement?: CrmRoutingCursorAdvancement;
      event: CrmLeadRoutedEventData;
      agentId: string;
      outcome: 'assigned';
      ruleId: string;
      strategy: CrmRoutingStrategy;
    }
  | {
      outcome: 'manual_review';
      reason: CrmRoutingManualReviewReason;
      ruleId?: string;
    }
  | {
      outcome: 'no_rule';
    }
  | {
      outcome: 'rejected';
      reason: CrmRoutingRejectionReason;
    };
