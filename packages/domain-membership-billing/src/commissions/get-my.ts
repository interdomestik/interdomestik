import { db } from '@interdomestik/database';
import { agentCommissions, user as userTable } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, desc, eq } from 'drizzle-orm';

import type {
  ActionResult,
  Commission,
  CommissionSession,
  CommissionStatus,
  CommissionType,
} from './types';

/** Get commissions for the current agent */
export async function getMyCommissionsCore(params: {
  session: CommissionSession | null;
}): Promise<ActionResult<Commission[]>> {
  const { session } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!['agent', 'staff', 'admin'].includes(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

  try {
    const tenantId = ensureTenantId(session);

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
      .where(
        and(eq(agentCommissions.agentId, session.user.id), eq(agentCommissions.tenantId, tenantId))
      )
      .orderBy(desc(agentCommissions.earnedAt));

    // Enrich with names
    const commissions: Commission[] = await Promise.all(
      rows.map(async row => {
        const member = row.memberId
          ? await db.query.user.findFirst({
              where: and(eq(userTable.id, row.memberId), eq(userTable.tenantId, tenantId)),
            })
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
