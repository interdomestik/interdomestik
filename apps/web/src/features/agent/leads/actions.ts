'use server';

import { auth } from '@/lib/auth';
import { db, memberLeads } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
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
