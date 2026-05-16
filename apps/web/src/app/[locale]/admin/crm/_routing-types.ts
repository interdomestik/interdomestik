import type { CrmRoutingStrategy } from '@interdomestik/domain-crm/routing';

export const ADMIN_CRM_ROUTING_MARKER_PREFIX = 'admin-crm-routing-';
export const ADMIN_CRM_ROUTING_RULES_LIST_MARKER = `${ADMIN_CRM_ROUTING_MARKER_PREFIX}rules-list`;
export const ADMIN_CRM_ROUTING_RULE_FORM_MARKER = `${ADMIN_CRM_ROUTING_MARKER_PREFIX}rule-form`;
export const ADMIN_CRM_ROUTING_RULE_ACTION_RESULT_MARKER = `${ADMIN_CRM_ROUTING_MARKER_PREFIX}action-result`;

export type AdminCrmRoutingScope =
  | { kind: 'tenant' }
  | { kind: 'branch'; branchId: string; branchLabel: string };

export interface AdminCrmRoutingRuleSummary {
  id: string;
  enabled: boolean;
  archived: boolean;
  scope: AdminCrmRoutingScope;
  filters: {
    source: string | null;
    leadType: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
  };
  effectiveWindow: { from: string | null; to: string | null };
  strategy: CrmRoutingStrategy;
  priority: number;
  agentPoolCount: number;
  capacityCaps: {
    maxNewLeadsPerAgentPerDay: number | null;
    maxOpenLeadsPerAgent: number | null;
  };
  fallback: {
    agentId: string | null;
    ruleId: string | null;
  };
  updatedAt: string;
}

export interface AdminCrmRoutingRulesPayload {
  rules: readonly AdminCrmRoutingRuleSummary[];
  counts: { active: number; archived: number };
}

export type AdminCrmRoutingActionErrorReason =
  | 'invalid_strategy'
  | 'invalid_priority_or_cap'
  | 'invalid_window'
  | 'empty_agent_pool'
  | 'duplicate_agent_id'
  | 'duplicate_rule_id'
  | 'cross_tenant_agent'
  | 'branch_incompatible_agent'
  | 'invalid_branch'
  | 'self_referential_fallback'
  | 'branch_incompatible_rule'
  | 'archived_fallback'
  | 'disabled_fallback'
  | 'field_too_long'
  | 'unknown_field'
  | 'forbidden'
  | 'not_found'
  | 'cursor_conflict'
  | 'repository_failure';

export type AdminCrmRoutingActionResult =
  | { status: 'ok'; ruleId: string }
  | { status: 'error'; reason: AdminCrmRoutingActionErrorReason; field?: string };

export const ADMIN_CRM_ROUTING_ERROR_MESSAGE_BY_REASON: Record<
  AdminCrmRoutingActionErrorReason,
  string
> = {
  archived_fallback: 'routing.error.archivedFallback',
  branch_incompatible_agent: 'routing.error.branchAgent',
  branch_incompatible_rule: 'routing.error.branchFallback',
  cross_tenant_agent: 'routing.error.crossTenantAgent',
  cursor_conflict: 'routing.error.cursorConflict',
  duplicate_agent_id: 'routing.error.duplicateAgent',
  duplicate_rule_id: 'routing.error.duplicateRule',
  empty_agent_pool: 'routing.error.emptyAgentPool',
  field_too_long: 'routing.error.fieldTooLong',
  forbidden: 'routing.error.forbidden',
  invalid_branch: 'routing.error.invalidBranch',
  invalid_priority_or_cap: 'routing.error.invalidPriority',
  invalid_strategy: 'routing.error.invalidStrategy',
  invalid_window: 'routing.error.invalidWindow',
  not_found: 'routing.error.notFound',
  repository_failure: 'routing.error.generic',
  disabled_fallback: 'routing.error.disabledFallback',
  self_referential_fallback: 'routing.error.selfFallback',
  unknown_field: 'routing.error.unknownField',
};
