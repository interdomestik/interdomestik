import { db } from '@interdomestik/database';
import { agentCommissions, user as userTable } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, desc, eq, sql } from 'drizzle-orm';

import type {
  ActionResult,
  Commission,
  CommissionSession,
  CommissionStatus,
  CommissionType,
} from '../types';
import { ensureAdminOrStaff } from './access';

const MAX_RESULTS = 100;

/** Get all commissions (admin/staff only, tenant-scoped) */
export async function getAllCommissionsCore(params: {
  session: CommissionSession | null;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<Commission[]>> {
  const authError = ensureAdminOrStaff(params.session);
  if (authError) return authError;

  try {
    const tenantId = ensureTenantId(params.session!);
    const limit = Math.min(params.limit ?? MAX_RESULTS, MAX_RESULTS); // Cap at 100
    const offset = params.offset ?? 0;

    const rows = await db
      .select({
        id: agentCommissions.id,
        agentId: agentCommissions.agentId,
        memberId: agentCommissions.memberId,
        subscriptionId: agentCommissions.subscriptionId,
        type: agentCommissions.type,
        status: agentCommissions.status,
        amount: agentCommissions.amount,
        currency: agentCommissions.currency,
        earnedAt: agentCommissions.earnedAt,
        paidAt: agentCommissions.paidAt,
        metadata: agentCommissions.metadata,
      })
      .from(agentCommissions)
      .where(eq(agentCommissions.tenantId, tenantId)) // SECURITY: Tenant scoping
      .orderBy(desc(agentCommissions.earnedAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(rows.flatMap(r => [r.agentId, r.memberId].filter(Boolean)))];
    const users = userIds.length
      ? await db
          .select()
          .from(userTable)
          .where(and(eq(userTable.tenantId, tenantId), sql`${userTable.id} IN ${userIds}`))
      : [];

    const userMap = new Map(users.map(u => [u.id, u]));

    const commissions: Commission[] = rows.map(row => {
      const agent = userMap.get(row.agentId);
      const member = row.memberId ? userMap.get(row.memberId) : null;
      return {
        ...row,
        agentName: agent?.name ?? 'Unknown',
        agentEmail: agent?.email ?? '',
        memberName: member?.name ?? null,
        memberEmail: member?.email ?? null,
        type: row.type as CommissionType,
        status: row.status as CommissionStatus,
      };
    });

    return { success: true, data: commissions };
  } catch (error) {
    console.error('Error fetching all commissions:', error);
    return { success: false, error: 'Failed to fetch commissions' };
  }
}
