import type { CrmActorContext } from '../context';
import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingCursorAdvancement,
  CrmRoutingRule,
} from './types';

export type CrmRoutingCursorAdvanceResult =
  | { success: true; advancement: CrmRoutingCursorAdvancement }
  | { success: false; reason: 'cursor_conflict' };

export interface CrmRoutingRepository {
  appendRoutingAssignmentAudit(params: {
    auditRecord: CrmRoutingAssignmentAuditRecord;
    idempotencyKey?: string | null;
  }): Promise<CrmRoutingAssignmentAuditRecord>;
  advanceRoutingCursor(params: {
    advancement: CrmRoutingCursorAdvancement;
    idempotencyKey?: string | null;
  }): Promise<CrmRoutingCursorAdvanceResult>;
  listRoutingRules(params: { actor: CrmActorContext }): Promise<readonly CrmRoutingRule[]>;
}

export type {
  CrmLeadRoutedEventData,
  CrmRoutingAgentWorkload,
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingAssignmentAuditReasonCode,
  CrmRoutingAssignmentDecision,
  CrmRoutingCapacityState,
  CrmRoutingCursorAdvancement,
  CrmRoutingCursorMap,
  CrmRoutingDedupeState,
  CrmRoutingDeferredStrategy,
  CrmRoutingLeadLifecycleState,
  CrmRoutingLeadSnapshot,
  CrmRoutingManualOverride,
  CrmRoutingManualReviewReason,
  CrmRoutingRejectionReason,
  CrmRoutingRule,
  CrmRoutingStrategy,
  CrmRoutingWorkloadSnapshot,
  SelectCrmLeadAssigneeInput,
} from './types';

export { CRM_ROUTING_WORKLOAD_MAX_AGE_MINUTES } from './types';
