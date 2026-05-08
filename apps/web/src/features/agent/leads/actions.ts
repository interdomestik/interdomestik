'use server';

import { auth } from '@/lib/auth';
import { and, db, eq, memberLeads } from '@interdomestik/database';
import { startPayment } from '@interdomestik/domain-leads';
import { ROLES, ensureTenantId } from '@interdomestik/shared-auth';
import type { SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

type LeadScope = 'tenant' | 'agent';
type LeadScopeCondition = SQL<unknown>;
type LeadStatus = typeof memberLeads.$inferInsert.status;

const LEAD_STATUSES = [
  'new',
  'contacted',
  'payment_pending',
  'paid',
  'converted',
  'lost',
  'disqualified',
  'expired',
] as const satisfies readonly LeadStatus[];

function assertLeadStatus(status: string): LeadStatus {
  if ((LEAD_STATUSES as readonly string[]).includes(status)) {
    return status as LeadStatus;
  }

  throw new Error('Invalid lead status');
}

async function resolveLeadAccess(params: {
  leadId: string;
  scope: LeadScope;
}): Promise<{ tenantId: string; scopedWhere: LeadScopeCondition }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);
  const conditions: LeadScopeCondition[] = [
    eq(memberLeads.id, params.leadId),
    eq(memberLeads.tenantId, tenantId),
  ];

  if (params.scope === 'agent') {
    if (session.user.role !== ROLES.agent || !session.user.branchId) {
      throw new Error('Lead not found or access denied');
    }
    conditions.push(eq(memberLeads.agentId, session.user.id));
    conditions.push(eq(memberLeads.branchId, session.user.branchId));
  }

  const scopedWhere = and(...conditions);
  if (!scopedWhere) {
    throw new Error('Lead not found or access denied');
  }

  const lead = await db.query.memberLeads.findFirst({
    where: scopedWhere,
  });

  if (!lead) {
    throw new Error('Lead not found or access denied');
  }

  return { tenantId, scopedWhere };
}

async function updateLeadStatusCore(params: {
  leadId: string;
  status: LeadStatus;
  tenantId: string;
  scopedWhere: LeadScopeCondition;
}) {
  const { leadId, status, tenantId, scopedWhere } = params;

  // If requesting payment, we MUST create a payment attempt record
  if (status === 'payment_pending') {
    // Default to Cash 150 EUR for Ops Flow MVP
    await startPayment(
      { tenantId },
      {
        leadId,
        method: 'cash',
        amountCents: 15000,
        priceId: 'default_membership',
      }
    );
  } else {
    await db
      .update(memberLeads)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(scopedWhere);
  }

  revalidatePath('/[locale]/(app)/agent/leads');
  return { success: true };
}

/**
 * Updates the status of a lead.
 * strictly enforces tenant, agent, and branch isolation.
 */
export async function updateLeadStatus(leadId: string, status: string) {
  const { tenantId, scopedWhere } = await resolveLeadAccess({ leadId, scope: 'agent' });
  return updateLeadStatusCore({ leadId, status: assertLeadStatus(status), tenantId, scopedWhere });
}

/**
 * Converts a lead to a client (member).
 * This is a simplified version that just updates status for now,
 * or would trigger a complex flow. MVP: Status -> 'converted'.
 */
export async function convertLeadToClient(leadId: string) {
  const { tenantId, scopedWhere } = await resolveLeadAccess({ leadId, scope: 'agent' });
  return updateLeadStatusCore({ leadId, status: 'converted', tenantId, scopedWhere });
}
