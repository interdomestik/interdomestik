import { and, eq, memberLeads } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { startPayment } from '@interdomestik/domain-leads';
import { notInArray, type SQL } from 'drizzle-orm';
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

// Lead statuses an agent's status-only write may not leave from, given the requested status.
function lockedFrom(requested: LeadStatus): NonNullable<LeadStatus>[] {
  return requested === 'converted' ? ['paid', 'payment_pending'] : ['paid'];
}

function isCashLocked(current: LeadStatus | null | undefined, requested: LeadStatus): boolean {
  if (requested === 'paid' || current === 'paid') return true;
  return requested === 'converted' && current === 'payment_pending';
}

function cashLockedError(): Error {
  return new Error(
    'This lead has a cash payment in verification; membership setup completes there.'
  );
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
  // Only payment verification marks a lead paid, and only member conversion completes a lead
  // whose cash payment is in verification or verified.
  if (isCashLocked(lead.status, status)) throw cashLockedError();

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

  // The same rule is re-checked in the write itself, so a concurrent approval cannot be overwritten.
  // db-access-guard: tenant-scoped -- reason: tenantId from validated function parameter at current DB boundary
  const written = await withTenantAuthority(scope.authority, tx =>
    tx
      .update(memberLeads)
      .set({
        notes: updatedNotes,
        status,
        updatedAt: new Date(),
      })
      .where(and(scopedWhere, notInArray(memberLeads.status, lockedFrom(status))))
      .returning({ id: memberLeads.id })
  );
  if (written.length === 0) throw cashLockedError();

  return { success: true };
}
