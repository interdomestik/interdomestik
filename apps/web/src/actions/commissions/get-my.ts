import { db } from '@interdomestik/database';
import { agentCommissions, user as userTable } from '@interdomestik/database/schema';
import { desc, eq } from 'drizzle-orm';

import type {
  ActionResult,
  Commission,
  CommissionStatus,
  CommissionType,
} from '../commissions.types';
import type { Session } from './context';

/** Get commissions for the current agent */
export async function getMyCommissionsCore(params: {
  session: NonNullable<Session> | null;
}): Promise<ActionResult<Commission[]>> {
  const { session } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!['agent', 'staff', 'admin'].includes(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

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
      .where(eq(agentCommissions.agentId, session.user.id))
      .orderBy(desc(agentCommissions.earnedAt));

    // Enrich with names
    const commissions: Commission[] = await Promise.all(
      rows.map(async row => {
        const member = row.memberId
          ? await db.query.user.findFirst({ where: eq(userTable.id, row.memberId) })
          : null;
        return {
          ...row,
          agentName: session.user.name ?? 'Unknown',
          agentEmail: session.user.email,
          memberName: member?.name ?? null,
          memberEmail: member?.email ?? null,
          type: row.type as CommissionType,
          status: row.status as CommissionStatus,
        };
      })
    );

    return { success: true, data: commissions };
  } catch (error) {
    console.error('Error fetching commissions:', error);
    return { success: false, error: 'Failed to fetch commissions' };
  }
}
