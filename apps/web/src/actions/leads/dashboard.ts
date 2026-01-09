'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

const listLeadsSchema = z.object({
  status: z.enum(['new', 'payment_pending', 'converted', 'disqualified', 'expired']).optional(),
  branchId: z.string().optional(),
});

export async function listLeadsAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = listLeadsSchema.parse(input);
    const { session, userRole, scope, tenantId } = ctx;
    const { user } = session;
    const { status } = data;

    const conditions = [eq(memberLeads.tenantId, tenantId)];

    if (status) {
      conditions.push(eq(memberLeads.status, status));
    }

    // Role-based visibility
    if (userRole === 'agent') {
      conditions.push(eq(memberLeads.agentId, user.id));
    } else if (userRole === 'branch_manager') {
      const { branchId } = scope;
      if (branchId) {
        conditions.push(eq(memberLeads.branchId, branchId));
      }
    } else if (['admin', 'tenant_admin', 'super_admin'].includes(userRole)) {
      if (data.branchId) {
        conditions.push(eq(memberLeads.branchId, data.branchId));
      }
    }

    // Fetch leads
    // We might want payment attempts too?
    const leads = await db.query.memberLeads.findMany({
      where: and(...conditions),
      orderBy: [desc(memberLeads.createdAt)],
      with: {
        leadPaymentAttempts: true, // Need to add relation first!
      },
    });

    return leads;
  });
}
