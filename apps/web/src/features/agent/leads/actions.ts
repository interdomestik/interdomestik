'use server';

import { auth } from '@/lib/auth';
import { updateScopedAgentLeadStatus, type AgentLeadScope } from './server/lead-actions';
import { memberLeads } from '@interdomestik/database';
import { ROLES, ensureTenantId } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

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

async function resolveAgentLeadScope(leadId: string): Promise<AgentLeadScope> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);
  if (session.user.role !== ROLES.agent || !session.user.branchId) {
    throw new Error('Lead not found or access denied');
  }

  return {
    agentId: session.user.id,
    branchId: session.user.branchId,
    leadId,
    tenantId,
  };
}

/**
 * Updates the status of a lead.
 * strictly enforces tenant, agent, and branch isolation.
 */
export async function updateLeadStatus(leadId: string, status: string) {
  const result = await updateScopedAgentLeadStatus({
    scope: await resolveAgentLeadScope(leadId),
    status: assertLeadStatus(status),
  });
  revalidatePath('/[locale]/(app)/agent/leads');
  return result;
}

/**
 * Converts a lead to a client (member).
 * This is a simplified version that just updates status for now,
 * or would trigger a complex flow. MVP: Status -> 'converted'.
 */
export async function convertLeadToClient(leadId: string) {
  const result = await updateScopedAgentLeadStatus({
    scope: await resolveAgentLeadScope(leadId),
    status: 'converted',
  });
  revalidatePath('/[locale]/(app)/agent/leads');
  return result;
}
