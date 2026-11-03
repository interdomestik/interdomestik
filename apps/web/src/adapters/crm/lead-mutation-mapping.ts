import type { CrmLead, CrmLeadActivity } from '@interdomestik/domain-crm/leads/types';

import type { crmActivities, crmLeads } from '@interdomestik/database/schema';

type CrmLeadRow = typeof crmLeads.$inferSelect;
type CrmActivityRow = typeof crmActivities.$inferSelect;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function mapLead(row: CrmLeadRow): CrmLead {
  return {
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    companyName: row.companyName,
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    email: row.email,
    fullName: row.fullName,
    id: row.id,
    notes: row.notes,
    phone: row.phone,
    score: row.score,
    source: row.source,
    stage: row.stage,
    tenantId: row.tenantId,
    type: row.type,
    lostAt: toIso(row.lostAt),
    updatedAt: toIso(row.updatedAt),
    wonAt: toIso(row.wonAt),
  };
}

export function mapActivity(row: CrmActivityRow): CrmLeadActivity {
  return {
    agentId: row.agentId,
    branchId: row.branchId ?? null,
    completedAt: toIso(row.completedAt),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    description: row.description,
    id: row.id,
    leadId: row.leadId,
    occurredAt: toIso(row.occurredAt) ?? toIso(row.createdAt) ?? new Date(0).toISOString(),
    scheduledAt: toIso(row.scheduledAt),
    subject: row.summary,
    tenantId: row.tenantId,
    type: row.type,
  };
}
