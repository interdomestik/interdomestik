'use server';

import { auth } from '@/lib/auth';
import { db, leads } from '@interdomestik/database';
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
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
  });

  if (!lead) {
    throw new Error('Lead not found or access denied');
  }

  await db
    .update(leads)
    .set({
      status: status as any,
      updatedAt: new Date(),
    })
    .where(eq(leads.id, leadId));

  revalidatePath('/[locale]/(app)/agent/leads');
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
