import { db } from '@interdomestik/database';
import { agentCommissions, user as userTable } from '@interdomestik/database/schema';
import { desc, sql } from 'drizzle-orm';

import type {
  ActionResult,
  Commission,
  CommissionStatus,
  CommissionType,
} from '../commissions.types';
import { ensureAdmin } from './access';
import type { Session } from './context';

/** Get all commissions (admin only) */
export async function getAllCommissionsCore(params: {
  session: NonNullable<Session> | null;
}): Promise<ActionResult<Commission[]>> {
  const authError = ensureAdmin(params.session);
  if (authError) return authError;

  try {
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
      .orderBy(desc(agentCommissions.earnedAt));

    const userIds = [...new Set(rows.flatMap(r => [r.agentId, r.memberId].filter(Boolean)))];
    const users = userIds.length
      ? await db
          .select()
          .from(userTable)
          .where(sql`${userTable.id} IN ${userIds}`)
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
