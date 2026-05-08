'use server';

import { updateScopedAgentLeadStatus } from '@/features/agent/leads/server/lead-actions';
import { ROLE_AGENT } from '@/lib/roles.core';
import { runAuthenticatedAction } from '@/lib/safe-action';
import { z } from 'zod';

const updateLeadStatusSchema = z.object({
  leadId: z.string(),
  status: z.enum([
    'new',
    'contacted',
    'payment_pending',
    'paid',
    'converted',
    'lost',
    'disqualified',
    'expired',
  ]),
  notes: z.string().optional(),
});

export async function updateLeadStatusAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = updateLeadStatusSchema.parse(input);
    const { leadId, status, notes } = data;
    const { tenantId, userRole } = ctx;
    const { actorAgentId, branchId } = ctx.scope;

    if (userRole !== ROLE_AGENT || !actorAgentId || !branchId) {
      throw new Error('Unauthorized');
    }

    await updateScopedAgentLeadStatus({
      notes,
      scope: {
        agentId: actorAgentId,
        branchId,
        leadId,
        tenantId,
      },
      status,
    });

    return { success: true };
  });
}
