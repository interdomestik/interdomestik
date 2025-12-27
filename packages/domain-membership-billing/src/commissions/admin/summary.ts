import { db } from '@interdomestik/database';
import { agentCommissions } from '@interdomestik/database/schema';
import { sql } from 'drizzle-orm';

import type { ActionResult, CommissionSession, CommissionSummary } from '../types';
import { ensureAdmin } from './access';

/** Get global commission summary (admin only) */
export async function getGlobalCommissionSummaryCore(params: {
  session: CommissionSession | null;
}): Promise<ActionResult<CommissionSummary>> {
  const authError = ensureAdmin(params.session);
  if (authError) return authError;

  try {
    const rows = await db
      .select({
        status: agentCommissions.status,
        total: sql<string>`SUM(${agentCommissions.amount})`,
        count: sql<number>`COUNT(*)`,
      })
      .from(agentCommissions)
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
      const amount = parseFloat(row.total || '0');
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
    console.error('Error fetching global summary:', error);
    return { success: false, error: 'Failed to fetch summary' };
  }
}
