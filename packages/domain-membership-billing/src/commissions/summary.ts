import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { eq, sql } from 'drizzle-orm';

import type { ActionResult, CommissionSession, CommissionSummary } from './types';

/** Get commission summary for current agent */
export async function getMyCommissionSummaryCore(params: {
  session: CommissionSession | null;
}): Promise<ActionResult<CommissionSummary>> {
  const { session } = params;

  if (!session?.user) return { success: false, error: 'Unauthorized' };
  if (!['agent', 'staff', 'admin'].includes(session.user.role)) {
    return { success: false, error: 'Access denied' };
  }

  try {
    const rows = await db
      .select({
        status: agentCommissions.status,
        total: sql<string>`SUM(${agentCommissions.amount})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
      .where(eq(agentCommissions.agentId, session.user.id))
      .groupBy(agentCommissions.status);

    const summary: CommissionSummary = {
      totalPending: 0,
      totalApproved: 0,
      totalPaid: 0,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
    };

    for (const row of rows) {
      const amount = Number.parseFloat(row.total || '0');
      const count = Number(row.count);
      if (row.status === 'pending') {
        summary.totalPending = amount;
        summary.pendingCount = count;
      } else if (row.status === 'approved') {
        summary.totalApproved = amount;
        summary.approvedCount = count;
      } else if (row.status === 'paid') {
        summary.totalPaid = amount;
        summary.paidCount = count;
      }
    }

    return { success: true, data: summary };
  } catch (error) {
    console.error('Error fetching commission summary:', error);
    return { success: false, error: 'Failed to fetch summary' };
  }
}
