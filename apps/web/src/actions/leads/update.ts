'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const updateLeadStatusSchema = z.object({
  leadId: z.string(),
  status: z.enum(['contacted', 'lost', 'disqualified']),
  notes: z.string().optional(),
});

export async function updateLeadStatusAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = updateLeadStatusSchema.parse(input);
    const { leadId, status, notes } = data;
    const { tenantId, session, userRole } = ctx;
    const { user } = session;

    // Verify ownership or permission
    const lead = await db.query.memberLeads.findFirst({
      where: (l, { eq, and }) => and(eq(l.id, leadId), eq(l.tenantId, tenantId)),
    });

    if (!lead) throw new Error('Lead not found');

    if (userRole === 'agent' && lead.agentId !== user.id) {
      throw new Error('Unauthorized');
    }

    await db
      .update(memberLeads)
      .set({
        status,
        notes: notes ? `${lead.notes ? lead.notes + '\n' : ''}${notes}` : undefined,
        updatedAt: new Date(),
      })
      .where(eq(memberLeads.id, leadId));

    return { success: true };
  });
}
