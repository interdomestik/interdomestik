import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmRoutingRule, CrmRoutingStrategy } from '@interdomestik/domain-crm/routing';

export type AdminCrmRoutingRuleRow = CrmRoutingRule & {
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCrmRoutingRuleWriteInput = {
  agentIds: readonly string[];
  branchId?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  enabled?: boolean;
  fallbackAgentId?: string | null;
  fallbackRuleId?: string | null;
  leadType?: string | null;
  maxNewLeadsPerAgentPerDay?: number | null;
  maxOpenLeadsPerAgent?: number | null;
  priority: number;
  source?: string | null;
  strategy: CrmRoutingStrategy;
  utmCampaign?: string | null;
  utmMedium?: string | null;
  utmSource?: string | null;
};

export type AdminCrmRoutingAgentScopeRow = {
  branchId: string | null;
  id: string;
  role: string;
  tenantId: string;
};

export type AdminCrmRoutingBranchRow = {
  id: string;
  label: string;
  tenantId: string;
};

export interface AdminCrmRoutingRuleAdminRepository {
  archiveRoutingRule(params: {
    actor: CrmActorContext;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null>;
  createRoutingRule(params: {
    actor: CrmActorContext;
    input: AdminCrmRoutingRuleWriteInput;
  }): Promise<AdminCrmRoutingRuleRow>;
  getRoutingRule(params: {
    actor: CrmActorContext;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null>;
  listAgentScopes(params: {
    agentIds: readonly string[];
    tenantId: string;
  }): Promise<readonly AdminCrmRoutingAgentScopeRow[]>;
  listBranches(params: { tenantId: string }): Promise<readonly AdminCrmRoutingBranchRow[]>;
  listRoutingRulesForAdmin(params: {
    actor: CrmActorContext;
  }): Promise<readonly AdminCrmRoutingRuleRow[]>;
  reorderRoutingRules(params: {
    actor: CrmActorContext;
    branchId?: string | null;
    ruleIds: readonly string[];
  }): Promise<readonly AdminCrmRoutingRuleRow[]>;
  setRoutingRuleEnabled(params: {
    actor: CrmActorContext;
    enabled: boolean;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | null>;
  updateRoutingRule(params: {
    actor: CrmActorContext;
    expectedUpdatedAt: string;
    input: AdminCrmRoutingRuleWriteInput;
    ruleId: string;
  }): Promise<AdminCrmRoutingRuleRow | 'cursor_conflict' | null>;
}
