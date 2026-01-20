'use server';

import { auth } from '@/lib/auth';
import { db, memberLeads } from '@interdomestik/database';
import { startPayment } from '@interdomestik/domain-leads';
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
        status: status as any,
        updatedAt: new Date(),
      })
      .where(eq(memberLeads.id, leadId));
  }

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
