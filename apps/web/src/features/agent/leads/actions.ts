'use server';

import { auth } from '@/lib/auth';
import { and, db, eq, memberFollowups, memberLeads } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

/**
 * Updates the status of a lead.
 * strictly enforces tenant isolation.
 */
export async function updateLeadStatus(leadId: string, status: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);

  // Authz: Lead must belong to tenant
  const lead = await db.query.memberLeads.findFirst({
    where: and(eq(memberLeads.id, leadId), eq(memberLeads.tenantId, tenantId)),
  });

  if (!lead) {
    throw new Error('Lead not found or access denied');
  }

  await db
    .update(memberLeads)
    .set({
      status: status as any,
      updatedAt: new Date(),
    })
    .where(eq(memberLeads.id, leadId));

  // Revalidate the agent leads list across locales.
  revalidatePath('/agent/leads');
  return { success: true };
}

/**
 * Converts a lead to a client (member).
 * This is a simplified version that just updates status for now,
 * or would trigger a complex flow. MVP: Status -> 'converted'.
 */
export async function convertLeadToClient(leadId: string) {
  // Re-use status update for MVP, but explicit action allows for future expansion
  // (e.g. creating user account, sending invite)
  return updateLeadStatus(leadId, 'converted');
}

/**
 * Marks a member follow-up as done.
 * Enforces strict tenant + agent scoping.
 */
export async function markFollowUpAsDone(followupId: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);
  const agentId = session.user.id;

  // Authz: Followup must belong to tenant AND this specific agent
  const followup = await db.query.memberFollowups.findFirst({
    where: and(
      eq(memberFollowups.id, followupId),
      eq(memberFollowups.tenantId, tenantId),
      eq(memberFollowups.agentId, agentId)
    ),
  });

  if (!followup) {
    throw new Error('Follow-up not found or access denied');
  }

  await db
    .update(memberFollowups)
    .set({
      status: 'completed',
      updatedAt: new Date(),
    })
    .where(eq(memberFollowups.id, followupId));

  revalidatePath('/agent/follow-ups');
  return { success: true };
}
