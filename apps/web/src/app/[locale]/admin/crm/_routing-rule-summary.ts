import { type AdminCrmRoutingRuleRow } from '@/adapters/crm/routing-repository';
import { type AdminCrmRoutingRuleSummary } from './_routing-types';

export function toRuleSummary(
  rule: AdminCrmRoutingRuleRow,
  branchLabels: ReadonlyMap<string, string>
): AdminCrmRoutingRuleSummary {
  return {
    agentPoolCount: rule.agentIds.length,
    archived: Boolean(rule.archivedAt),
    capacityCaps: {
      maxNewLeadsPerAgentPerDay: rule.maxNewLeadsPerAgentPerDay ?? null,
      maxOpenLeadsPerAgent: rule.maxOpenLeadsPerAgent ?? null,
    },
    effectiveWindow: {
      from: rule.effectiveFrom ?? null,
      to: rule.effectiveTo ?? null,
    },
    enabled: rule.enabled,
    fallback: {
      agentId: rule.fallbackAgentId ?? null,
      ruleId: rule.fallbackRuleId ?? null,
    },
    filters: {
      leadType: rule.leadType ?? null,
      source: rule.source ?? null,
      utmCampaign: rule.utmCampaign ?? null,
      utmMedium: rule.utmMedium ?? null,
      utmSource: rule.utmSource ?? null,
    },
    id: rule.id,
    priority: rule.priority,
    scope: rule.branchId
      ? {
          branchId: rule.branchId,
          branchLabel: branchLabels.get(rule.branchId) ?? rule.branchId,
          kind: 'branch',
        }
      : { kind: 'tenant' },
    strategy: rule.strategy,
    updatedAt: rule.updatedAt,
  };
}
