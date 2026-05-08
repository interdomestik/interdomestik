import { and, db, eq, memberLeads } from '@interdomestik/database';
import { startPayment } from '@interdomestik/domain-leads';
import type { SQL } from 'drizzle-orm';

type LeadScopeCondition = SQL<unknown>;
type LeadStatus = typeof memberLeads.$inferInsert.status;

export type AgentLeadScope = {
  agentId: string;
  branchId: string;
  leadId: string;
  tenantId: string;
};

function buildAgentLeadWhere(scope: AgentLeadScope): LeadScopeCondition {
  const scopedWhere = and(
    eq(memberLeads.id, scope.leadId),
    eq(memberLeads.tenantId, scope.tenantId),
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
  const lead = await db.query.memberLeads.findFirst({
    where: scopedWhere,
  });

  if (!lead) {
    throw new Error('Lead not found or access denied');
  }

  if (status === 'payment_pending') {
    await startPayment(
      {
        agentId: scope.agentId,
        branchId: scope.branchId,
        tenantId: scope.tenantId,
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

  await db
    .update(memberLeads)
    .set({
      notes: notes ? `${lead.notes ? `${lead.notes}\n` : ''}${notes}` : lead.notes,
      status,
      updatedAt: new Date(),
    })
    .where(scopedWhere);

  return { success: true };
}
