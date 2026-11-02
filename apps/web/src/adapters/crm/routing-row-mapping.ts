import type {
  CrmRoutingAssignmentAuditRecord,
  CrmRoutingRule,
  CrmRoutingStrategy,
} from '@interdomestik/domain-crm/routing';
import { randomUUID } from 'node:crypto';

import type { crmRoutingAssignmentsAudit, crmRoutingRules } from '@interdomestik/database/schema';

import type { AdminCrmRoutingRuleRow, AdminCrmRoutingRuleWriteInput } from './routing-admin-types';

export type CrmRoutingRuleRow = typeof crmRoutingRules.$inferSelect;
type CrmRoutingAssignmentAuditRow = typeof crmRoutingAssignmentsAudit.$inferSelect;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function mapRule(row: CrmRoutingRuleRow): CrmRoutingRule {
  return {
    agentIds: row.agentPool,
    branchId: row.branchId ?? null,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIso(row.effectiveTo),
    enabled: row.enabled,
    fallbackAgentId: row.fallbackAgentId ?? null,
    fallbackRuleId: row.fallbackRuleId ?? null,
    id: row.id,
    leadType: row.leadType ?? null,
    maxNewLeadsPerAgentPerDay: row.maxNewLeadsPerAgentPerDay ?? null,
    maxOpenLeadsPerAgent: row.maxOpenLeadsPerAgent ?? null,
    priority: row.priority,
    source: row.source ?? null,
    strategy: row.strategy as CrmRoutingStrategy,
    tenantId: row.tenantId,
    utmCampaign: row.utmCampaign ?? null,
    utmMedium: row.utmMedium ?? null,
    utmSource: row.utmSource ?? null,
  };
}

export function mapAdminRule(row: CrmRoutingRuleRow): AdminCrmRoutingRuleRow {
  return {
    ...mapRule(row),
    archivedAt: toIso(row.archivedAt),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  };
}

function nullableDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value);
}

export function ruleWriteValues(input: AdminCrmRoutingRuleWriteInput) {
  return {
    agentPool: [...input.agentIds],
    branchId: input.branchId ?? null,
    effectiveFrom: nullableDate(input.effectiveFrom),
    effectiveTo: nullableDate(input.effectiveTo),
    enabled: input.enabled ?? true,
    fallbackAgentId: input.fallbackAgentId ?? null,
    fallbackRuleId: input.fallbackRuleId ?? null,
    leadType: input.leadType ?? null,
    maxNewLeadsPerAgentPerDay: input.maxNewLeadsPerAgentPerDay ?? null,
    maxOpenLeadsPerAgent: input.maxOpenLeadsPerAgent ?? null,
    priority: input.priority,
    source: input.source ?? null,
    strategy: input.strategy,
    updatedAt: new Date(),
    utmCampaign: input.utmCampaign ?? null,
    utmMedium: input.utmMedium ?? null,
    utmSource: input.utmSource ?? null,
  };
}

export function mapAudit(row: CrmRoutingAssignmentAuditRow): CrmRoutingAssignmentAuditRecord {
  if (!row.actorId || !row.selectedAgentId) {
    throw new Error('CRM routing audit row is missing assignment actor or selected agent');
  }
  const occurredAt = toIso(row.occurredAt);
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) {
    throw new Error('CRM routing audit row is missing a valid occurrence timestamp');
  }

  return {
    actorId: row.actorId,
    agentId: row.selectedAgentId,
    branchId: row.branchId ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    leadId: row.leadId,
    occurredAt,
    reasonCode: row.reasonCode as CrmRoutingAssignmentAuditRecord['reasonCode'],
    ruleId: row.ruleId,
    strategy: row.strategy as CrmRoutingStrategy,
    tenantId: row.tenantId,
  };
}

export function auditValues(params: {
  auditRecord: CrmRoutingAssignmentAuditRecord;
  idempotencyKey?: string | null;
}) {
  const idempotencyKey = params.idempotencyKey ?? params.auditRecord.idempotencyKey ?? null;

  return {
    actorId: params.auditRecord.actorId,
    branchId: params.auditRecord.branchId ?? null,
    id: randomUUID(),
    idempotencyKey,
    leadId: params.auditRecord.leadId,
    occurredAt: new Date(params.auditRecord.occurredAt),
    reasonCode: params.auditRecord.reasonCode,
    ruleId: params.auditRecord.ruleId,
    selectedAgentId: params.auditRecord.agentId,
    strategy: params.auditRecord.strategy,
    tenantId: params.auditRecord.tenantId,
  };
}
