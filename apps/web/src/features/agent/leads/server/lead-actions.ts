import { and, eq, memberLeads } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { startPayment } from '@interdomestik/domain-leads';
import type { SQL } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type LeadScopeCondition = SQL<unknown>;
type LeadStatus = typeof memberLeads.$inferInsert.status;

export type AgentLeadScope = {
  agentId: string;
  branchId: string;
  leadId: string;
  authority: TenantAuthority;
};

function buildAgentLeadWhere(scope: AgentLeadScope): LeadScopeCondition {
  const { tenantId } = readTenantAuthority(scope.authority);
  const scopedWhere = and(
    eq(memberLeads.id, scope.leadId),
    eq(memberLeads.tenantId, tenantId),
    eq(memberLeads.agentId, scope.agentId),
    eq(memberLeads.branchId, scope.branchId)
  );

  if (!scopedWhere) {
    throw new Error('Lead not found or access denied');
  }

  return scopedWhere;
}

export async function updateScopedAgentLeadStatus(params: {
  notes?: string;
  scope: AgentLeadScope;
  status: LeadStatus;
}) {
  const { notes, scope, status } = params;
  const scopedWhere = buildAgentLeadWhere(scope);
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const lead = await withTenantAuthority(scope.authority, tx =>
    tx.query.memberLeads.findFirst({
      where: scopedWhere,
    })
  );

  if (!lead) {
    throw new Error('Lead not found or access denied');
  }

  if (status === 'payment_pending') {
    await startPayment(
      {
        agentId: scope.agentId,
        authority: scope.authority,
        branchId: scope.branchId,
      },
      {
        leadId: scope.leadId,
        method: 'cash',
        amountCents: 15000,
        priceId: 'default_membership',
      }
    );
    return { success: true };
  }

  const updatedNotes = notes ? [lead.notes, notes].filter(Boolean).join('\n') : lead.notes;

  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  await withTenantAuthority(scope.authority, tx =>
    tx
      .update(memberLeads)
      .set({
        notes: updatedNotes,
        status,
        updatedAt: new Date(),
      })
      .where(scopedWhere)
  );

  return { success: true };
}
