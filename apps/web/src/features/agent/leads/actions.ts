'use server';

import { leadSalesClosedFailure } from '@/actions/leads/sales-closed';
import { toActionError } from '@/lib/safe-action.failure';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { updateScopedAgentLeadStatus, type AgentLeadScope } from './server/lead-actions';
import { memberLeads } from '@interdomestik/database';
import { ROLES } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';

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
  const authorized = await authorizeSessionTenant(await headers());

  if (!authorized) {
    throw new UnauthorizedError('Unauthorized');
  }

  const { session, authority } = authorized;
  if (session.user.role !== ROLES.agent || !session.user.branchId) {
    throw new Error('Lead not found or access denied');
  }

  return {
    agentId: session.user.id,
    branchId: session.user.branchId,
    leadId,
    authority,
  };
}

/**
 * Updates the status of a lead.
 * strictly enforces tenant, agent, and branch isolation.
 */
export async function updateLeadStatus(leadId: string, status: string) {
  try {
    const result = await updateScopedAgentLeadStatus({
      scope: await resolveAgentLeadScope(leadId),
      status: assertLeadStatus(status),
    });
    revalidatePath('/[locale]/(app)/agent/leads');
    return result;
  } catch (error) {
    return toActionError(await leadSalesClosedFailure(error));
  }
}

/**
 * Converts a lead to a client (member).
 * This is a simplified version that just updates status for now,
 * or would trigger a complex flow. MVP: Status -> 'converted'.
 */
export async function convertLeadToClient(leadId: string) {
  return updateLeadStatus(leadId, 'converted');
}
