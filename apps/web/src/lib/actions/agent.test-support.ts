import { expect } from 'vitest';

export const IMPORT_AGENT_SESSION = {
  user: { id: 'agent1', name: 'Agent', role: 'agent', tenantId: 'tenant_mk', branchId: 'b1' },
} as const;

export function makeCredential(label: string) {
  return ['member', label, 'access'].join('-');
}

export function buildImportRow(index = 0) {
  return {
    fullName: `Bulk User ${index}`,
    email: `bulk-${index}@example.test`,
    phone: `+38344111${String(index).padStart(3, '0')}`,
    password: makeCredential(`bulk-${index}`),
    planId: 'standard' as const,
  };
}

export async function loadImportMembersAction() {
  const actions = await import('./agent');
  return (actions as Record<string, unknown>).importMembers as (
    prevState: unknown,
    formData: FormData
  ) => Promise<unknown>;
}

export function createRowsFormData(rows: unknown[]) {
  const formData = new FormData();
  formData.set('rowsJson', JSON.stringify(rows));
  return formData;
}

export function scopedLeadPredicate(leadId = 'lead1', tenantId = 'tenant_mk', agentId = 'agent1') {
  return expect.objectContaining({
    op: 'and',
    args: expect.arrayContaining([
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'id' }),
        right: leadId,
      }),
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'tenantId' }),
        right: tenantId,
      }),
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'agentId' }),
        right: agentId,
      }),
    ]),
  });
}

export function leadLookupPredicate(leadId = 'lead1', tenantId = 'tenant_mk') {
  return expect.objectContaining({
    op: 'and',
    args: expect.arrayContaining([
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'tenantId' }),
        right: tenantId,
      }),
      expect.objectContaining({
        op: 'eq',
        left: expect.objectContaining({ name: 'id' }),
        right: leadId,
      }),
    ]),
  });
}
