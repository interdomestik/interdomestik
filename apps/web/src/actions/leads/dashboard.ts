'use server';

import { runAuthenticatedAction } from '@/lib/safe-action';
import { db } from '@interdomestik/database';
import { memberLeads } from '@interdomestik/database/schema';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { z } from 'zod';

const listLeadsSchema = z.object({
  status: z
    .enum([
      'new',
      'contacted',
      'payment_pending',
      'paid',
      'converted',
      'lost',
      'disqualified',
      'expired',
    ])
    .optional(),
  branchId: z.string().optional(),
  search: z.string().optional(),
});

export async function listLeadsAction(input: unknown) {
  return runAuthenticatedAction(async ctx => {
    const data = listLeadsSchema.parse(input);
    const { session, userRole, scope, tenantId } = ctx;
    const { user } = session;
    const { status, search } = data;

    const conditions = [eq(memberLeads.tenantId, tenantId)];

    if (status) {
      conditions.push(eq(memberLeads.status, status));
    }

    if (search) {
      // Basic search on name/email
      const searchLower = `%${search.toLowerCase()}%`;
      const searchCondition = or(
        ilike(memberLeads.firstName, searchLower),
        ilike(memberLeads.lastName, searchLower),
        ilike(memberLeads.email, searchLower)
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
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
    const leads = await db.query.memberLeads.findMany({
      where: and(...conditions),
      orderBy: [desc(memberLeads.createdAt)],
      with: {
        leadPaymentAttempts: true,
      },
      limit: 100, // Safety limit
    });

    return leads;
  });
}
